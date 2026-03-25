/**
 * モデルファイルのダウンロード・IndexedDBキャッシュ管理
 * 参照実装: ndlkotenocr-worker/src/utils/model-loader.js
 */

const DB_NAME = 'NDLOCRLiteDB'
const DB_VERSION = 2
const STORE_NAME = 'models'

// モデルのバージョン（URLが変わったらここを更新）
export const MODEL_VERSION = '1.0.0'

// モデル配信ベースURL（環境変数 VITE_MODEL_BASE_URL で指定、末尾スラッシュなし）
// 空の場合は /models（public/models/ からの配信）をデフォルトにする
const MODEL_BASE_URL = (import.meta.env.VITE_MODEL_BASE_URL as string | undefined) || '/models'

import type { RecognitionLanguage } from '../types/model-config'

// ONNXモデルのURL（日本語: NDL PARSeq × 3カスケード）
export const MODEL_URLS_JA: Record<string, string> = {
  layout: `${MODEL_BASE_URL}/deim-s-1024x1024.onnx`,
  recognition30: `${MODEL_BASE_URL}/parseq-ndl-30.onnx`,   // カテゴリ3: ≤30文字 [1,3,16,256]
  recognition50: `${MODEL_BASE_URL}/parseq-ndl-50.onnx`,   // カテゴリ2: ≤50文字 [1,3,16,384]
  recognition100: `${MODEL_BASE_URL}/parseq-ndl-100.onnx`,  // カテゴリ1: ≤100文字 [1,3,16,768]
}

// ONNXモデルのURL（欧米諸語: OnnxTR PARSeq multilingual × 1）
export const MODEL_URLS_EUROPEAN: Record<string, string> = {
  layout: `${MODEL_BASE_URL}/deim-s-1024x1024.onnx`,       // レイアウト検出は共通
  recognitionEuropean: `${MODEL_BASE_URL}/parseq-multilingual.onnx`, // 単一モデル [1,3,32,128]
}

/** 言語に応じたモデルURL辞書を返す */
export function getModelUrls(language: RecognitionLanguage = 'ja'): Record<string, string> {
  return language === 'european' ? MODEL_URLS_EUROPEAN : MODEL_URLS_JA
}

// 後方互換: デフォルトは日本語
export const MODEL_URLS = MODEL_URLS_JA

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('models')) {
        db.createObjectStore('models', { keyPath: 'name' })
      }
      // Version 2: results ストアを再作成（per-run スキーマ）
      if (db.objectStoreNames.contains('results')) {
        db.deleteObjectStore('results')
      }
      const resultsStore = db.createObjectStore('results', { keyPath: 'id' })
      resultsStore.createIndex('by_createdAt', 'createdAt', { unique: false })
    }
  })
}

async function getModelFromCache(
  modelName: string
): Promise<ArrayBuffer | undefined> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(modelName)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const entry = request.result
      if (entry && entry.version === MODEL_VERSION) {
        resolve(entry.data)
      } else {
        resolve(undefined)
      }
    }
  })
}

async function saveModelToCache(
  modelName: string,
  data: ArrayBuffer
): Promise<void> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({
      name: modelName,
      data,
      cachedAt: Date.now(),
      version: MODEL_VERSION,
    })

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function downloadWithProgress(
  url: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  // SPAフォールバックでHTMLが返った場合（モデルファイルが存在しない）を検出
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error(`Model file not found (HTML returned): ${url}`)
  }

  const contentLength = parseInt(
    response.headers.get('content-length') || '0',
    10
  )
  let receivedLength = 0

  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    receivedLength += value.length

    if (onProgress && contentLength > 0) {
      onProgress(receivedLength / contentLength)
    }
  }

  const allChunks = new Uint8Array(receivedLength)
  let position = 0
  for (const chunk of chunks) {
    allChunks.set(chunk, position)
    position += chunk.length
  }

  return allChunks.buffer
}

export async function loadModel(
  modelType: string,
  onProgress?: (progress: number) => void,
  language?: RecognitionLanguage
): Promise<ArrayBuffer> {
  const urls = getModelUrls(language)
  const modelUrl = urls[modelType]
  if (!modelUrl) {
    throw new Error(`Unknown model type: ${modelType} for language ${language ?? 'ja'}`)
  }

  // キャッシュキーに言語プレフィックスを付けて衝突を防止
  const cacheKey = language && language !== 'ja' ? `${language}:${modelType}` : modelType

  const cached = await getModelFromCache(cacheKey)
  if (cached) {
    console.log(`Model ${cacheKey} loaded from cache`)
    if (onProgress) onProgress(1.0)
    return cached
  }

  console.log(`Downloading model ${cacheKey} from ${modelUrl}`)
  const modelData = await downloadWithProgress(modelUrl, onProgress)

  await saveModelToCache(cacheKey, modelData)
  console.log(`Model ${cacheKey} cached successfully`)

  return modelData
}

export async function clearModelCache(): Promise<void> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
