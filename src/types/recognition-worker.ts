import type { RecognitionLanguage } from './model-config'

export type RecWorkerInMessage =
  | { type: 'REC_INIT'; singleModel?: boolean; language?: RecognitionLanguage }
  | { type: 'REC_PROCESS'; jobs: Array<{ id: number; croppedImageData: ImageData; charCountCategory?: number }> }
  | { type: 'REC_TERMINATE' }

export type RecWorkerOutMessage =
  | { type: 'REC_READY' }
  | { type: 'REC_PROGRESS'; progress: number }
  | { type: 'REC_COMPLETE'; results: Array<{ id: number; text: string; confidence: number }> }
  | { type: 'REC_ERROR'; error: string }
