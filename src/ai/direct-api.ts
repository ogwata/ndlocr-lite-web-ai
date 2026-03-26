import type { AIConnector, ProofreadResult, ProviderConfig, AIProvider } from '../types/ai'
import { PROVIDER_ENDPOINTS, DEFAULT_PROOFREAD_PROMPT } from '../types/ai'

const REQUEST_TIMEOUT_MS = 120_000
const MAX_RETRIES = 2
const INITIAL_RETRY_DELAY_MS = 1000

/**
 * Direct API コネクタ — ブラウザから各AI APIへ直接リクエストを送信
 */
export function createDirectApiConnector(
  config: ProviderConfig,
  customPrompt?: string,
): AIConnector {
  const prompt = customPrompt || DEFAULT_PROOFREAD_PROMPT

  return {
    async proofread(ocrText: string, imageBase64: string): Promise<ProofreadResult> {
      const correctedText = await callProvider(config, prompt, ocrText, imageBase64)
      return { correctedText, changes: [] }
    },

    async testConnection(): Promise<boolean> {
      try {
        await callProvider(config, 'Reply with OK.', 'test', '')
        return true
      } catch {
        return false
      }
    },
  }
}

/** タイムアウト付き fetch */
async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw new Error(`Network error: ${err instanceof Error ? err.message : 'Connection failed'}`)
  } finally {
    clearTimeout(timer)
  }
}

/** レートリミット・一時エラー時の指数バックオフリトライ */
async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init)

      // 429 (Rate Limit) or 5xx (Server Error) → リトライ
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = res.headers.get('retry-after')
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }

      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)))
        continue
      }
    }
  }
  throw lastError ?? new Error('Request failed after retries')
}

/** エラーレスポンスをユーザー向けメッセージに変換 */
export function formatApiError(provider: string, status: number, body: string): Error {
  if (status === 401 || status === 403) {
    return new Error(`${provider}: Invalid API key or insufficient permissions.`)
  }
  if (status === 429) {
    return new Error(`${provider}: Rate limit exceeded. Please wait and try again.`)
  }
  if (status >= 500) {
    return new Error(`${provider}: Server error (${status}). Please try again later.`)
  }
  // 他のエラーは本文を含める
  const short = body.length > 200 ? body.slice(0, 200) + '...' : body
  return new Error(`${provider} API error ${status}: ${short}`)
}

async function callProvider(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, systemPrompt, userText, imageBase64)
    case 'openai':
    case 'groq':
      return callOpenAICompatible(config, systemPrompt, userText, imageBase64)
    case 'google':
      return callGoogle(config, systemPrompt, userText, imageBase64)
    case 'custom':
      return callOpenAICompatible(config, systemPrompt, userText, imageBase64)
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

function getEndpoint(config: ProviderConfig): string {
  if (config.provider === 'custom' && config.endpoint) return config.endpoint
  return PROVIDER_ENDPOINTS[config.provider]
}

/** data:image/...;base64,XXXX → { mediaType, data } */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
  if (match) return { mediaType: match[1], data: match[2] }
  return { mediaType: 'image/png', data: dataUrl }
}

// ─── Anthropic Messages API ───

async function callAnthropic(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const content: Array<Record<string, unknown>> = []

  if (imageBase64) {
    const { mediaType, data } = parseDataUrl(imageBase64)
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    })
  }

  content.push({ type: 'text', text: userText })

  const res = await fetchWithRetry(getEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw formatApiError('Anthropic', res.status, err)
  }

  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}

// ─── OpenAI-compatible API (OpenAI, Groq, Custom) ───

async function callOpenAICompatible(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const userContent: Array<Record<string, unknown>> = []

  if (imageBase64 && supportsVision(config.provider)) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`,
      },
    })
  }

  userContent.push({ type: 'text', text: userText })

  const res = await fetchWithRetry(getEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw formatApiError(config.provider, res.status, err)
  }

  const json = await res.json()
  return json.choices?.[0]?.message?.content ?? ''
}

function supportsVision(provider: AIProvider): boolean {
  return provider !== 'groq'
}

// ─── Google Gemini API ───

async function callGoogle(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const parts: Array<Record<string, unknown>> = []

  if (imageBase64) {
    const { mediaType, data } = parseDataUrl(imageBase64)
    parts.push({
      inline_data: { mime_type: mediaType, data },
    })
  }

  parts.push({ text: userText })

  const endpoint = `${PROVIDER_ENDPOINTS.google}/${config.model}:generateContent?key=${config.apiKey}`

  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw formatApiError('Google', res.status, err)
  }

  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}
