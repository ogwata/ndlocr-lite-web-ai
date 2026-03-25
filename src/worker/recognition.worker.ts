/**
 * 認識専用 Web Worker
 * rec30 / rec50 / rec100 の3モデルを保持し、charCountCategory に応じて使い分ける
 */

import './onnx-config'
import { loadModel } from './model-loader'
import { TextRecognizer } from './text-recognizer'
import type { RecWorkerInMessage, RecWorkerOutMessage } from '../types/recognition-worker'
import type { RecognitionLanguage } from '../types/model-config'

let rec30: TextRecognizer | null = null
let rec50: TextRecognizer | null = null
let rec100: TextRecognizer | null = null
let recEuropean: TextRecognizer | null = null
let singleModelMode = false
let currentLanguage: RecognitionLanguage = 'ja'

function selectRecognizer(_charCountCategory?: number): TextRecognizer {
  if (currentLanguage === 'european') return recEuropean!
  if (singleModelMode) return rec100!
  if (_charCountCategory === 3) return rec30!
  if (_charCountCategory === 2) return rec50!
  return rec100!
}

self.onmessage = async (e: MessageEvent<RecWorkerInMessage>) => {
  const msg = e.data

  if (msg.type === 'REC_INIT') {
    singleModelMode = msg.singleModel ?? false
    currentLanguage = msg.language ?? 'ja'
    try {
      if (currentLanguage === 'european') {
        // 欧米諸語: 単一モデル
        const data = await loadModel('recognitionEuropean', (p) => {
          self.postMessage({ type: 'REC_PROGRESS', progress: p } satisfies RecWorkerOutMessage)
        }, currentLanguage)
        recEuropean = new TextRecognizer([1, 3, 32, 128], true)
        await recEuropean.initialize(data)
      } else if (singleModelMode) {
        const d100 = await loadModel('recognition100', (p) => {
          self.postMessage({ type: 'REC_PROGRESS', progress: p } satisfies RecWorkerOutMessage)
        })
        rec100 = new TextRecognizer([1, 3, 16, 768]); await rec100.initialize(d100)
      } else {
        const progresses = [0, 0, 0]
        const reportProgress = () => {
          const avg = (progresses[0] + progresses[1] + progresses[2]) / 3
          self.postMessage({ type: 'REC_PROGRESS', progress: avg } satisfies RecWorkerOutMessage)
        }

        const [d30, d50, d100] = await Promise.all([
          loadModel('recognition30',  (p) => { progresses[0] = p; reportProgress() }),
          loadModel('recognition50',  (p) => { progresses[1] = p; reportProgress() }),
          loadModel('recognition100', (p) => { progresses[2] = p; reportProgress() }),
        ])

        rec30  = new TextRecognizer([1, 3, 16, 256]); await rec30.initialize(d30)
        rec50  = new TextRecognizer([1, 3, 16, 384]); await rec50.initialize(d50)
        rec100 = new TextRecognizer([1, 3, 16, 768]); await rec100.initialize(d100)
      }

      self.postMessage({ type: 'REC_READY' } satisfies RecWorkerOutMessage)
    } catch (err) {
      self.postMessage({ type: 'REC_ERROR', error: (err as Error).message } satisfies RecWorkerOutMessage)
    }
  } else if (msg.type === 'REC_PROCESS') {
    try {
      const results: Array<{ id: number; text: string; confidence: number }> = []
      for (const job of msg.jobs) {
        const r = await selectRecognizer(job.charCountCategory).recognizeCropped(job.croppedImageData)
        results.push({ id: job.id, text: r.text, confidence: r.confidence })
      }
      self.postMessage({ type: 'REC_COMPLETE', results } satisfies RecWorkerOutMessage)
    } catch (err) {
      self.postMessage({ type: 'REC_ERROR', error: (err as Error).message } satisfies RecWorkerOutMessage)
    }
  } else if (msg.type === 'REC_TERMINATE') {
    rec30?.dispose()
    rec50?.dispose()
    rec100?.dispose()
    self.close()
  }
}
