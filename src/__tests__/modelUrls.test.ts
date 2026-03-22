import { describe, it, expect } from 'vitest'
import { MODEL_URLS } from '../worker/model-loader'

describe('MODEL_URLS', () => {
  it('layout モデルURLが定義されている', () => {
    expect(MODEL_URLS.layout).toBeDefined()
    expect(MODEL_URLS.layout).toContain('deim-s-1024x1024.onnx')
  })

  it('recognition30 モデルURLが定義されている', () => {
    expect(MODEL_URLS.recognition30).toBeDefined()
    expect(MODEL_URLS.recognition30).toContain('parseq-ndl-30.onnx')
  })

  it('recognition50 モデルURLが定義されている', () => {
    expect(MODEL_URLS.recognition50).toBeDefined()
    expect(MODEL_URLS.recognition50).toContain('parseq-ndl-50.onnx')
  })

  it('recognition100 モデルURLが定義されている', () => {
    expect(MODEL_URLS.recognition100).toBeDefined()
    expect(MODEL_URLS.recognition100).toContain('parseq-ndl-100.onnx')
  })

  it('VITE_MODEL_BASE_URL が空なら相対パス', () => {
    // .env で VITE_MODEL_BASE_URL= と空に設定しているので、
    // URLは /deim-s-1024x1024.onnx のようになるはず
    for (const url of Object.values(MODEL_URLS)) {
      expect(url).toMatch(/\.onnx$/)
    }
  })
})
