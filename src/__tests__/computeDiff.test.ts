import { describe, it, expect } from 'vitest'
import { computeDiff } from '../components/editor/DiffView'

describe('computeDiff', () => {
  it('同一テキストなら equal のみ', () => {
    const result = computeDiff('hello', 'hello')
    expect(result).toEqual([{ type: 'equal', text: 'hello' }])
  })

  it('挿入を検出する', () => {
    const result = computeDiff('abc', 'abXc')
    expect(result.some((s) => s.type === 'insert' && s.text === 'X')).toBe(true)
  })

  it('削除を検出する', () => {
    const result = computeDiff('abXc', 'abc')
    expect(result.some((s) => s.type === 'delete' && s.text === 'X')).toBe(true)
  })

  it('置換（削除+挿入）を検出する', () => {
    const result = computeDiff('云ふ', '言ふ')
    const types = result.map((s) => s.type)
    expect(types).toContain('delete')
    expect(types).toContain('insert')
  })

  it('空文字列同士なら空配列', () => {
    const result = computeDiff('', '')
    expect(result).toEqual([])
  })

  it('空文字列から追加', () => {
    const result = computeDiff('', 'new text')
    expect(result).toEqual([{ type: 'insert', text: 'new text' }])
  })

  it('全削除', () => {
    const result = computeDiff('old text', '')
    expect(result).toEqual([{ type: 'delete', text: 'old text' }])
  })

  it('日本語テキストの差分を検出する', () => {
    const original = '本年度も單位を取得した'
    const corrected = '本年度も単位を取得した'
    const result = computeDiff(original, corrected)
    expect(result.some((s) => s.type === 'delete' && s.text.includes('單'))).toBe(true)
    expect(result.some((s) => s.type === 'insert' && s.text.includes('単'))).toBe(true)
  })
})
