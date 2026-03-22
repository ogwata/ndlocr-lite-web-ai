import { describe, it, expect } from 'vitest'
import { formatApiError } from '../ai/direct-api'

describe('formatApiError', () => {
  it('401 → 無効なAPIキー', () => {
    const err = formatApiError('Anthropic', 401, 'Unauthorized')
    expect(err.message).toContain('Invalid API key')
  })

  it('403 → 権限不足', () => {
    const err = formatApiError('OpenAI', 403, 'Forbidden')
    expect(err.message).toContain('Invalid API key or insufficient permissions')
  })

  it('429 → レートリミット', () => {
    const err = formatApiError('Google', 429, 'Too Many Requests')
    expect(err.message).toContain('Rate limit exceeded')
  })

  it('500 → サーバーエラー', () => {
    const err = formatApiError('Groq', 500, 'Internal Server Error')
    expect(err.message).toContain('Server error (500)')
  })

  it('502 → サーバーエラー', () => {
    const err = formatApiError('Anthropic', 502, 'Bad Gateway')
    expect(err.message).toContain('Server error (502)')
  })

  it('400 → 本文を含むエラー', () => {
    const err = formatApiError('OpenAI', 400, 'Invalid request body')
    expect(err.message).toContain('API error 400')
    expect(err.message).toContain('Invalid request body')
  })

  it('長いエラー本文は200文字で切り詰める', () => {
    const longBody = 'x'.repeat(300)
    const err = formatApiError('Anthropic', 400, longBody)
    expect(err.message).toContain('...')
    // 200文字 + "..." + プレフィックス分
    expect(err.message.length).toBeLessThan(300)
  })

  it('プロバイダ名がメッセージに含まれる', () => {
    const err = formatApiError('MyProvider', 401, 'error')
    expect(err.message).toContain('MyProvider')
  })
})
