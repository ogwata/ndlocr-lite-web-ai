/**
 * OCRモデル構成の型定義
 *
 * ユーザーが設定画面で選択する認識言語・数式認識の構成を定義する。
 * 設定はlocalStorageに永続化し、Worker初期化時にモデルの選択に使用する。
 */

/** 認識言語モード */
export type RecognitionLanguage = 'ja' | 'european'

/** モデル構成 */
export interface ModelConfig {
  /** 認識言語 */
  language: RecognitionLanguage
  /** 数式認識を有効にするか */
  mathEnabled: boolean
}

/** デフォルトのモデル構成 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  language: 'ja',
  mathEnabled: false,
}

/** localStorage キー */
export const MODEL_CONFIG_STORAGE_KEY = 'ndlocrlite_model_config'

/** 保存 */
export function saveModelConfig(config: ModelConfig): void {
  localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(config))
}

/** 読み込み */
export function loadModelConfig(): ModelConfig {
  try {
    const stored = localStorage.getItem(MODEL_CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.language && (parsed.language === 'ja' || parsed.language === 'european')) {
        return {
          language: parsed.language,
          mathEnabled: !!parsed.mathEnabled,
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_MODEL_CONFIG
}

/** 言語モードの表示ラベル */
export const LANGUAGE_LABELS: Record<string, Record<RecognitionLanguage, string>> = {
  ja: {
    ja: '日本語',
    european: '欧米諸語',
  },
  en: {
    ja: 'Japanese',
    european: 'European Languages',
  },
}

/** 言語モードの説明文 */
export const LANGUAGE_DESCRIPTIONS: Record<string, Record<RecognitionLanguage, string>> = {
  ja: {
    ja: '歴史的文書・縦書き対応',
    european: '英語・ドイツ語・フランス語・スペイン語・ポルトガル語・イタリア語・オランダ語・チェコ語・ポーランド語・デンマーク語・ノルウェー語・フィンランド語',
  },
  en: {
    ja: 'Historical documents, vertical text',
    european: 'English, German, French, Spanish, Portuguese, Italian, Dutch, Czech, Polish, Danish, Norwegian, Finnish',
  },
}

/** ダウンロードサイズ見積もり */
export const DOWNLOAD_SIZES: Record<RecognitionLanguage, string> = {
  ja: '146MB',
  european: '107MB',
}

export const MATH_DOWNLOAD_SIZE = '118MB'
