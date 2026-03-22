import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MODELS,
  PROVIDER_ENDPOINTS,
  DEFAULT_PROOFREAD_PROMPT,
  DEFAULT_AI_SETTINGS,
} from '../types/ai'

describe('AI型定義・定数', () => {
  it('全プロバイダにデフォルトモデルが定義されている', () => {
    const providers = ['anthropic', 'openai', 'google', 'groq', 'custom'] as const
    for (const p of providers) {
      expect(DEFAULT_MODELS[p]).toBeDefined()
      expect(Array.isArray(DEFAULT_MODELS[p])).toBe(true)
    }
  })

  it('全プロバイダにエンドポイントが定義されている', () => {
    const providers = ['anthropic', 'openai', 'google', 'groq', 'custom'] as const
    for (const p of providers) {
      expect(PROVIDER_ENDPOINTS[p]).toBeDefined()
    }
  })

  it('Anthropic/OpenAI/Google/Groq のエンドポイントは https://', () => {
    expect(PROVIDER_ENDPOINTS.anthropic).toMatch(/^https:\/\//)
    expect(PROVIDER_ENDPOINTS.openai).toMatch(/^https:\/\//)
    expect(PROVIDER_ENDPOINTS.google).toMatch(/^https:\/\//)
    expect(PROVIDER_ENDPOINTS.groq).toMatch(/^https:\/\//)
  })

  it('custom のエンドポイントは空文字列', () => {
    expect(PROVIDER_ENDPOINTS.custom).toBe('')
  })

  it('デフォルトプロンプトに旧字体保持の指示が含まれる', () => {
    expect(DEFAULT_PROOFREAD_PROMPT).toContain('旧字体')
  })

  it('デフォルト設定が正しい構造を持つ', () => {
    expect(DEFAULT_AI_SETTINGS.mode).toBe('direct')
    expect(DEFAULT_AI_SETTINGS.directApi.provider).toBe('anthropic')
    expect(DEFAULT_AI_SETTINGS.directApi.apiKey).toBe('')
    expect(DEFAULT_AI_SETTINGS.mcp.serverUrl).toBe('')
    expect(DEFAULT_AI_SETTINGS.customPrompt).toBe(DEFAULT_PROOFREAD_PROMPT)
  })
})
