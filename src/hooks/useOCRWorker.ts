import { useRef, useState, useCallback, useEffect } from 'react'
import type { OCRJobState, OCRResult, ProcessedImage, TextBlock, TextRegion, PageBlock } from '../types/ocr'
import type { WorkerInMessage, WorkerOutMessage } from '../types/worker'
import type { RecWorkerInMessage, RecWorkerOutMessage } from '../types/recognition-worker'
import { loadModelConfig } from '../types/model-config'
import { imageDataToDataUrl } from '../utils/imageLoader'
import { ReadingOrderProcessor } from '../worker/reading-order'
// ?worker import → Vite が recognition.worker.ts を独立バンドルして Worker コンストラクタを返す
import RecognitionWorkerFactory from '../worker/recognition.worker.ts?worker'

const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
const N_REC_WORKERS = isMobile ? 0 : Math.min(Math.max(navigator.hardwareConcurrency ?? 4, 2), 8)
const readingOrderProcessor = new ReadingOrderProcessor()

const initialJobState: OCRJobState = {
  status: 'idle',
  currentFile: '',
  currentFileIndex: 0,
  totalFiles: 0,
  stageProgress: 0,
  stage: '',
  message: '',
}

export function useOCRWorker() {
  const workerRef = useRef<Worker | null>(null)
  const recWorkersRef = useRef<Worker[]>([])
  const [isReady, setIsReady] = useState(false)
  const [jobState, setJobState] = useState<OCRJobState>(initialJobState)

  // OCR Worker + 認識 Worker を起動（UIレンダリング完了後に遅延起動して初期描画を高速化）
  useEffect(() => {
    let cancelled = false

    const initWorkers = () => {
      if (cancelled) return

      const worker = new Worker(
        new URL('../worker/ocr.worker.ts', import.meta.url),
        { type: 'module' }
      )
      workerRef.current = worker

      // N 本の認識 Worker を ?worker import から生成（Vite が正しくバンドル）
      const recWorkers: Worker[] = Array.from({ length: N_REC_WORKERS }, () => new RecognitionWorkerFactory())
      recWorkersRef.current = recWorkers

      // 初期化完了フラグ（OCR Worker + 認識 Workers の両方が揃ったら isReady = true）
      let ocrWorkerReady = false
      let recReadyCount = 0

      const checkBothReady = () => {
        if (ocrWorkerReady && (N_REC_WORKERS === 0 || recReadyCount >= N_REC_WORKERS)) {
          setIsReady(true)
          setJobState(initialJobState)
        }
      }

      // OCR Worker 初期化（モデル構成をlocalStorageから読み込んで渡す）
      const modelConfig = loadModelConfig()
      worker.postMessage({ type: 'INITIALIZE', layoutOnly: isMobile, language: modelConfig.language } satisfies WorkerInMessage)

      worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
        const msg = event.data
        if (msg.type === 'OCR_PROGRESS') {
          if (msg.stage === 'initialized') {
            ocrWorkerReady = true
            checkBothReady()
          } else {
            setJobState((prev) => ({
              ...prev,
              status: 'loading_model',
              stageProgress: msg.progress,
              stage: msg.stage,
              message: msg.message,
              modelProgress: msg.modelProgress,
            }))
          }
        }
      }

      // 認識 Worker 初期化
      recWorkers.forEach((w) => {
        w.onmessage = (e: MessageEvent<RecWorkerOutMessage>) => {
          if (e.data.type === 'REC_READY') {
            recReadyCount++
            w.onmessage = null
            checkBothReady()
          }
        }
        w.postMessage({ type: 'REC_INIT', singleModel: isMobile, language: modelConfig.language } satisfies RecWorkerInMessage)
      })
    }

    // requestIdleCallback でUIレンダリング後にワーカー起動（初期描画を阻害しない）
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => initWorkers(), { timeout: 500 })
      return () => {
        cancelled = true
        cancelIdleCallback(id)
        workerRef.current?.terminate()
        recWorkersRef.current.forEach((w) => w.terminate())
        workerRef.current = null
        recWorkersRef.current = []
      }
    } else {
      const timer = setTimeout(initWorkers, 100)
      return () => {
        cancelled = true
        clearTimeout(timer)
        workerRef.current?.terminate()
        recWorkersRef.current.forEach((w) => w.terminate())
        workerRef.current = null
        recWorkersRef.current = []
      }
    }
  }, [])

  /**
   * processImage: バッチOCR用（LAYOUT_DETECT → 並列認識 → 読み順）
   * OCR Worker でレイアウト検出のみ行い、認識フェーズは N 本の認識 Worker に並列委譲する。
   * imageData は参照を保持したいため Transferable を使わずに structured clone で送信。
   */
  const processImage = useCallback(
    (image: ProcessedImage, fileIndex: number, totalFiles: number): Promise<OCRResult> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'))
          return
        }

        const id = `${Date.now()}-${fileIndex}`
        // imageData を転送前にキャプチャ（LAYOUT_DONE 受信後も参照可能にする）
        const imageDataUrl = imageDataToDataUrl(image.imageData)

        setJobState({
          status: 'processing',
          currentFile: image.fileName,
          currentFileIndex: fileIndex + 1,
          totalFiles,
          stageProgress: 0,
          stage: 'starting',
          message: '',
        })

        const handler = (event: MessageEvent<WorkerOutMessage>) => {
          const msg = event.data
          if (msg.id !== undefined && msg.id !== id) return

          if (msg.type === 'OCR_PROGRESS') {
            setJobState((prev) => ({
              ...prev,
              stageProgress: msg.progress,
              stage: msg.stage,
              message: msg.message,
              status: 'processing',
              modelProgress: msg.modelProgress,
            }))
          } else if (msg.type === 'OCR_COMPLETE') {
            // モバイル(OCR_PROCESS)パスの完了
            workerRef.current?.removeEventListener('message', handler)
            const fileName = image.pageIndex ? `${image.fileName} (p.${image.pageIndex})` : image.fileName
            setJobState((prev) => ({ ...prev, status: 'done', stageProgress: 1 }))
            resolve({
              id,
              fileName,
              imageDataUrl,
              textBlocks: msg.textBlocks,
              fullText: msg.txt,
              processingTimeMs: msg.processingTime,
              createdAt: Date.now(),
            })
          } else if (msg.type === 'LAYOUT_DONE') {
            workerRef.current?.removeEventListener('message', handler)
            runRecognition(id, imageDataUrl, image, msg.textRegions, msg.croppedImages, msg.pageBlocks, msg.startTime, resolve, reject)
          } else if (msg.type === 'OCR_ERROR') {
            workerRef.current?.removeEventListener('message', handler)
            setJobState((prev) => ({
              ...prev,
              status: 'error',
              errorMessage: msg.error,
            }))
            reject(new Error(msg.error))
          }
        }

        workerRef.current.addEventListener('message', handler)

        if (N_REC_WORKERS === 0) {
          // モバイル: ocr.worker 1つで完結（recognition.worker なし）
          workerRef.current.postMessage({
            type: 'OCR_PROCESS',
            id,
            imageData: image.imageData,
            startTime: Date.now(),
          } satisfies WorkerInMessage)
        } else {
          // デスクトップ: LAYOUT_DETECT → 並列 recognition workers
          workerRef.current.postMessage({
            type: 'LAYOUT_DETECT',
            id,
            imageData: image.imageData,
            startTime: Date.now(),
          } satisfies WorkerInMessage)
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  /** LAYOUT_DONE 後の認識フェーズを N 本の認識 Worker に並列委譲 */
  const runRecognition = (
    id: string,
    imageDataUrl: string,
    image: ProcessedImage,
    textRegions: TextRegion[],
    croppedImages: ImageData[],
    pageBlocks: PageBlock[],
    startTime: number,
    resolve: (result: OCRResult) => void,
    reject: (error: Error) => void
  ) => {
    const recWorkers = recWorkersRef.current

    if (textRegions.length === 0) {
      const result: OCRResult = {
        id,
        fileName: image.pageIndex ? `${image.fileName} (p.${image.pageIndex})` : image.fileName,
        imageDataUrl,
        textBlocks: [],
        fullText: '',
        processingTimeMs: Date.now() - startTime,
        createdAt: Date.now(),
      }
      setJobState((prev) => ({ ...prev, status: 'done', stageProgress: 1 }))
      resolve(result)
      return
    }

    const activeWorkers = Math.min(recWorkers.length, textRegions.length)
    setJobState((prev) => ({
      ...prev,
      stageProgress: 0.4,
      stage: 'text_recognition',
      message: `Recognizing text in ${textRegions.length} regions (${activeWorkers} threads)...`,
    }))

    // インデックス均等分割（round-robin）
    const N = recWorkers.length
    type Job = { id: number; croppedImageData: ImageData; charCountCategory?: number }
    const chunks: Job[][] = Array.from({ length: N }, () => [])
    textRegions.forEach((region, i) => {
      chunks[i % N].push({ id: i, croppedImageData: croppedImages[i], charCountCategory: region.charCountCategory })
    })

    const dispatch = (worker: Worker, jobs: Job[]): Promise<Array<{ id: number; text: string; confidence: number }>> =>
      new Promise((res, rej) => {
        if (jobs.length === 0) { res([]); return }
        worker.onmessage = (e: MessageEvent<RecWorkerOutMessage>) => {
          if (e.data.type === 'REC_COMPLETE') {
            worker.onmessage = null
            res(e.data.results)
          } else if (e.data.type === 'REC_ERROR') {
            worker.onmessage = null
            rej(new Error(e.data.error))
          }
        }
        const transferables = jobs.map(j => j.croppedImageData.data.buffer)
        worker.postMessage({ type: 'REC_PROCESS', jobs } satisfies RecWorkerInMessage, transferables)
      })

    Promise.all(recWorkers.map((w, i) => dispatch(w, chunks[i])))
      .then((chunkResults) => {
        const allResults = chunkResults.flat()
        const resultMap = new Map(allResults.map(r => [r.id, r]))

        const MIN_CONFIDENCE = 0.3
        const recognitionResults: TextBlock[] = textRegions
          .map((region, i) => ({
            ...region,
            text: resultMap.get(i)?.text ?? '',
            confidence: resultMap.get(i)?.confidence ?? 0,
            readingOrder: i + 1,
          }))
          .filter(b => b.confidence >= MIN_CONFIDENCE)

        setJobState((prev) => ({
          ...prev,
          stageProgress: 0.8,
          stage: 'reading_order',
          message: 'Processing reading order...',
        }))

        const orderedResults = readingOrderProcessor.process(recognitionResults, pageBlocks)
        const txt = orderedResults.filter(b => b.text).map(b => b.text).join('\n')

        const result: OCRResult = {
          id,
          fileName: image.pageIndex ? `${image.fileName} (p.${image.pageIndex})` : image.fileName,
          imageDataUrl,
          textBlocks: orderedResults,
          fullText: txt,
          processingTimeMs: Date.now() - startTime,
          createdAt: Date.now(),
          pageBlocks,
        }

        setJobState((prev) => ({ ...prev, status: 'done', stageProgress: 1 }))
        resolve(result)
      })
      .catch((err: Error) => {
        setJobState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: err.message,
        }))
        reject(err)
      })
  }

  /**
   * processRegion: 領域OCR用（OCR_PROCESS → 逐次認識、変更なし）
   */
  const processRegion = useCallback(
    (imageData: ImageData): Promise<{ textBlocks: TextBlock[]; fullText: string }> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'))
          return
        }

        const id = `region-${Date.now()}`

        const handler = (event: MessageEvent<WorkerOutMessage>) => {
          const msg = event.data
          if (msg.id !== id) return  // 他ジョブのメッセージを無視

          if (msg.type === 'OCR_COMPLETE') {
            workerRef.current?.removeEventListener('message', handler)
            resolve({ textBlocks: msg.textBlocks, fullText: msg.txt })
          } else if (msg.type === 'OCR_ERROR') {
            workerRef.current?.removeEventListener('message', handler)
            reject(new Error(msg.error))
          }
          // OCR_PROGRESS は意図的に無視（jobState に影響させない）
        }

        workerRef.current.addEventListener('message', handler)
        workerRef.current.postMessage(
          { type: 'OCR_PROCESS', id, imageData, startTime: Date.now() } satisfies WorkerInMessage,
          [imageData.data.buffer]  // Transferable でゼロコピー転送
        )
      })
    },
    []
  )

  const resetState = useCallback(() => {
    setJobState(initialJobState)
  }, [])

  return { isReady, jobState, processImage, processRegion, resetState }
}
