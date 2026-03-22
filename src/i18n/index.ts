import { ja } from './ja'
import { en } from './en'
import { zhCN } from './zh-CN'
import { zhTW } from './zh-TW'
import { ko } from './ko'

export type Language = 'ja' | 'en' | 'zh-CN' | 'zh-TW' | 'ko'
export type TranslationParams = Record<string, string | number>

/** Display labels for the language selector */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ko: '한국어',
}

/** All supported language codes, in display order */
export const LANGUAGES: Language[] = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko']

const translations: Record<Language, Record<string, Record<string, string>>> = {
  ja,
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ko,
}

function getNestedValue(obj: Record<string, unknown>, key: string): string {
  const parts = key.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return key
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : key
}

export function createTranslator(lang: Language) {
  return function t(key: string, params?: TranslationParams): string {
    let text = getNestedValue(translations[lang] as unknown as Record<string, unknown>, key)
    // Fallback to English if key not found in target language
    if (text === key && lang !== 'en') {
      text = getNestedValue(translations.en as unknown as Record<string, unknown>, key)
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }
}

export const LANG_STORAGE_KEY = 'ndlocrlite_lang'

export function getStoredLang(): Language {
  const stored = localStorage.getItem(LANG_STORAGE_KEY)
  if (stored && LANGUAGES.includes(stored as Language)) return stored as Language
  // Try to detect from browser locale
  const browserLang = navigator.language
  if (browserLang.startsWith('ja')) return 'ja'
  if (browserLang.startsWith('ko')) return 'ko'
  if (browserLang === 'zh-TW' || browserLang === 'zh-Hant') return 'zh-TW'
  if (browserLang.startsWith('zh')) return 'zh-CN'
  return 'ja'
}
