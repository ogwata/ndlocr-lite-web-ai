/** AI接続モード */
export type AIConnectionMode = 'direct' | 'mcp'

/** Direct APIプロバイダ */
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'groq' | 'custom'

/** プロバイダ設定 */
export interface ProviderConfig {
  provider: AIProvider
  apiKey: string
  model: string
  endpoint?: string // カスタムエンドポイント用
}

/** MCP Server設定 */
export interface MCPConfig {
  serverUrl: string // SSEエンドポイント
  toolName?: string // 使用するツール名
}

/** AI接続設定全体 */
export interface AISettings {
  mode: AIConnectionMode
  directApi: ProviderConfig
  mcp: MCPConfig
  customPrompt: string
}

/** 校正結果 */
export interface ProofreadResult {
  correctedText: string
  changes: Array<{
    original: string
    corrected: string
    position: number
    reason?: string
  }>
}

/** AI Connector インターフェース */
export interface AIConnector {
  proofread(ocrText: string, imageBase64: string): Promise<ProofreadResult>
  testConnection(): Promise<boolean>
}

/** デフォルトのプロバイダモデル */
export const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-haiku-4-20250414'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  google: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.0-flash-preview', 'gemini-3.0-pro-preview'],
  groq: ['llama-3.3-70b-versatile', 'gemma2-9b-it'],
  custom: [],
}

/** デフォルトのAPIエンドポイント */
export const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  custom: '',
}

/** デフォルト校正プロンプト（文書言語をプレースホルダで埋め込み） */
export const DEFAULT_PROOFREAD_PROMPT = `You are an expert OCR proofreader for {documentLanguage} text. Compare the following OCR text with the original image and fix recognition errors.

Important instructions:
- Fix only obvious OCR misrecognitions. Do not rephrase or modernize the text.
- Preserve the original language, spelling, and orthography exactly as in the image.
- For Japanese: preserve historical characters (旧字体/舊字體) without converting to modern forms.
- For European languages: fix misrecognized diacritics (ä, ö, ü, ß, é, è, ê, ç, ñ, etc.).
- Fix misrecognized punctuation and symbols.
- Preserve line breaks as they appear in the OCR output.
- Preserve separator lines (──────────── filename ────────────) exactly as they are. Do not modify or remove them.
- Output only the corrected text. No explanations.`

/** プロンプトに文書言語を埋め込む */
export function buildProofreadPrompt(template: string, documentLanguageName: string): string {
  return template.replace(/\{documentLanguage\}/g, documentLanguageName)
}

/** デフォルト設定 */
export const DEFAULT_AI_SETTINGS: AISettings = {
  mode: 'direct',
  directApi: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
  },
  mcp: {
    serverUrl: '',
  },
  customPrompt: DEFAULT_PROOFREAD_PROMPT,
}
