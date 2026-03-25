/**
 * OCRモデル構成・文書言語の型定義
 *
 * 文書言語（DocumentLanguage）はユーザーがOCR実行前に選択する。
 * 内部的にOCRモデル（RecognitionLanguage: ja/european）を自動選択する。
 */

/** OCRモデルの種別（内部用） */
export type RecognitionLanguage = 'ja' | 'european'

/** ユーザーが選択する文書言語 */
export type DocumentLanguage =
  | 'ja' | 'en' | 'de' | 'fr' | 'es' | 'pt'
  | 'it' | 'nl' | 'cs' | 'pl' | 'da' | 'no' | 'fi'

/** 文書言語 → OCRモデル種別のマッピング */
export function getRecognitionLanguage(docLang: DocumentLanguage): RecognitionLanguage {
  return docLang === 'ja' ? 'ja' : 'european'
}

/** 文書言語の表示ラベル（各言語のネイティブ表記） */
export const DOCUMENT_LANGUAGE_OPTIONS: Array<{ code: DocumentLanguage; label: string }> = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'cs', label: 'Čeština' },
  { code: 'pl', label: 'Polski' },
  { code: 'da', label: 'Dansk' },
  { code: 'no', label: 'Norsk' },
  { code: 'fi', label: 'Suomi' },
]

/** 文書言語の英語名（AI校正プロンプト用） */
export const DOCUMENT_LANGUAGE_NAMES: Record<DocumentLanguage, string> = {
  ja: 'Japanese',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  cs: 'Czech',
  pl: 'Polish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
}

/** モデル構成（永続化用） */
export interface ModelConfig {
  /** 数式認識を有効にするか */
  mathEnabled: boolean
}

/** デフォルトのモデル構成 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  mathEnabled: false,
}

/** localStorage キー */
export const MODEL_CONFIG_STORAGE_KEY = 'ndlocrlite_model_config'
export const DOC_LANG_STORAGE_KEY = 'ndlocrlite_doc_lang'

/** モデル構成の保存 */
export function saveModelConfig(config: ModelConfig): void {
  localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(config))
}

/** モデル構成の読み込み */
export function loadModelConfig(): ModelConfig {
  try {
    const stored = localStorage.getItem(MODEL_CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { mathEnabled: !!parsed.mathEnabled }
    }
  } catch { /* ignore */ }
  return DEFAULT_MODEL_CONFIG
}

/** 文書言語の保存 */
export function saveDocumentLanguage(lang: DocumentLanguage): void {
  localStorage.setItem(DOC_LANG_STORAGE_KEY, lang)
}

/** 文書言語の読み込み */
export function loadDocumentLanguage(): DocumentLanguage {
  const stored = localStorage.getItem(DOC_LANG_STORAGE_KEY)
  if (stored && DOCUMENT_LANGUAGE_OPTIONS.some(o => o.code === stored)) {
    return stored as DocumentLanguage
  }
  return 'ja'
}

/** ダウンロードサイズ見積もり */
export const DOWNLOAD_SIZES: Record<RecognitionLanguage, string> = {
  ja: '146MB',
  european: '107MB',
}

export const MATH_DOWNLOAD_SIZE = '118MB'
