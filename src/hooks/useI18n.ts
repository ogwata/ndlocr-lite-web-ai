import { useState, useCallback } from 'react'
import {
  type Language,
  type TranslationParams,
  createTranslator,
  getStoredLang,
  LANG_STORAGE_KEY,
} from '../i18n'

export function useI18n() {
  const [lang, setLang] = useState<Language>(getStoredLang)

  const t = useCallback(
    (key: string, params?: TranslationParams) => createTranslator(lang)(key, params),
    [lang]
  )

  // For <select onChange> — reads value from the event
  const toggleLanguage = useCallback((e?: React.ChangeEvent<HTMLSelectElement> | Language) => {
    let next: Language
    if (typeof e === 'string') {
      next = e
    } else if (e && 'target' in e) {
      next = e.target.value as Language
    } else {
      // cycle fallback (unused but keeps compat)
      const order: Language[] = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko']
      const idx = order.indexOf(lang)
      next = order[(idx + 1) % order.length]
    }
    setLang(next)
    localStorage.setItem(LANG_STORAGE_KEY, next)
  }, [lang])

  return { lang, t, toggleLanguage }
}
