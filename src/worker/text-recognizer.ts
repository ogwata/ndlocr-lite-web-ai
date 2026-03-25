/**
 * 文字認識モジュール（PARSeqモデル）
 * 参照実装: ndlkotenocr-worker/src/worker/text-recognizer.js
 */

import * as yaml from 'js-yaml'
import type * as OrtType from 'onnxruntime-web'
import { ort, createSession } from './onnx-config'
import type { TextRegion } from '../types/ocr'

interface RecognizerConfig {
  inputShape: [number, number, number, number]
  charList: string[]
  maxLength: number
  /** 正規化: 'symmetric' = [-1,1] (日本語), 'custom' = 欧米諸語用 mean/std */
  normalization: 'symmetric' | 'custom'
  /** custom normalization の mean/std (欧米諸語用) */
  mean?: [number, number, number]
  std?: [number, number, number]
}

interface RecognitionResult {
  text: string
  confidence: number
}

/** Module-level cache: fetch NDLMoji.yaml only once per worker */
let cachedYamlConfig: Record<string, unknown> | null = null
let configLoadPromise: Promise<Record<string, unknown> | null> | null = null

async function loadSharedConfig(): Promise<Record<string, unknown> | null> {
  if (cachedYamlConfig) return cachedYamlConfig
  if (configLoadPromise) return configLoadPromise

  configLoadPromise = (async () => {
    try {
      const response = await fetch('/config/NDLmoji.yaml')
      if (!response.ok) throw new Error(`Failed to load config: ${response.statusText}`)
      const yamlText = await response.text()
      cachedYamlConfig = yaml.load(yamlText) as Record<string, unknown>
      console.log('NDLMoji.yaml loaded and cached')
      return cachedYamlConfig
    } catch (error) {
      console.warn(`Failed to load config: ${(error as Error).message}`)
      configLoadPromise = null // allow retry on failure
      return null
    }
  })()

  return configLoadPromise
}

export class TextRecognizer {
  private session: OrtType.InferenceSession | null = null
  private initialized = false
  private config: RecognizerConfig

  private isEuropean: boolean

  constructor(inputShape?: [number, number, number, number], european = false) {
    this.isEuropean = european
    this.config = {
      inputShape: inputShape ?? (european ? [1, 3, 32, 128] : [1, 3, 16, 384]),
      charList: [],
      maxLength: 25,
      normalization: european ? 'custom' : 'symmetric',
      mean: european ? [0.694, 0.695, 0.693] : undefined,
      std: european ? [0.299, 0.296, 0.301] : undefined,
    }
  }

  async initialize(modelData: ArrayBuffer): Promise<void> {
    if (this.initialized) return

    try {
      await this.loadConfig()
      this.session = await createSession(modelData)
      this.initialized = true
      console.log('Text recognizer initialized successfully')
    } catch (error) {
      console.error('Failed to initialize text recognizer:', error)
      throw error
    }
  }

  private async loadConfig(): Promise<void> {
    if (this.isEuropean) {
      // 欧米諸語: OnnxTR PARSeq multilingual の固定語彙（195文字）
      const EUROPEAN_VOCAB = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~°£€¥¢฿àâéèêëîïôùûüçÀÂÉÈÊËÎÏÔÙÛÜÇáãíóõúÁÃÍÓÕÚñÑ¡¿äößÄÖẞčďěňřšťůýžČĎĚŇŘŠŤŮÝŽąćęłńśźżĄĆĘŁŃŚŹŻìòÌÒæøåÆØÅ§'
      this.config.charList = EUROPEAN_VOCAB.split('')
      this.config.maxLength = 32
      console.log(`European character list loaded: ${this.config.charList.length} characters`)
      return
    }

    // 日本語: NDLMoji.yaml から文字セットを読み込み
    const yamlConfig = await loadSharedConfig()
    if (!yamlConfig) return

    if (yamlConfig?.text_recognition) {
      const textConfig = yamlConfig.text_recognition as Record<string, unknown>
      if (textConfig.input_shape) this.config.inputShape = textConfig.input_shape as [number, number, number, number]
      if (textConfig.max_length) this.config.maxLength = textConfig.max_length as number
    }

    if ((yamlConfig?.model as Record<string, unknown>)?.charset_train) {
      const charsetTrain = (yamlConfig.model as Record<string, unknown>).charset_train as string
      this.config.charList = charsetTrain.split('')
      console.log(`Character list loaded: ${this.config.charList.length} characters`)
    }
  }

  async recognize(imageData: ImageData, region: TextRegion): Promise<RecognitionResult> {
    const cropped = TextRecognizer.cropImageData(imageData, region)
    return this.recognizeCropped(cropped)
  }

  async recognizeCropped(croppedImageData: ImageData): Promise<RecognitionResult> {
    if (!this.initialized || !this.session) {
      throw new Error('Text recognizer not initialized')
    }

    try {
      const inputTensor = this.preprocess(croppedImageData)
      const output = await this.session.run({
        [this.session.inputNames[0]]: inputTensor,
      })
      return this.decodeOutput(output)
    } catch (error) {
      console.error('Text recognition failed:', error)
      return { text: '', confidence: 0.0 }
    }
  }

  static cropImageData(imageData: ImageData, region: TextRegion): ImageData {
    const sourceCanvas = new OffscreenCanvas(imageData.width, imageData.height)
    const sourceCtx = sourceCanvas.getContext('2d')!
    sourceCtx.putImageData(imageData, 0, 0)

    const canvas = new OffscreenCanvas(region.width, region.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)

    return ctx.getImageData(0, 0, region.width, region.height)
  }

  /** 複数領域を一括クロップ。sourceCanvas を1度だけ生成して使い回す（個別生成だと N × フルサイズ Canvas が同時に乗るためOOM） */
  static cropImageDataBatch(imageData: ImageData, regions: TextRegion[]): ImageData[] {
    const sourceCanvas = new OffscreenCanvas(imageData.width, imageData.height)
    const sourceCtx = sourceCanvas.getContext('2d')!
    sourceCtx.putImageData(imageData, 0, 0)

    return regions.map(region => {
      const canvas = new OffscreenCanvas(region.width, region.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
      return ctx.getImageData(0, 0, region.width, region.height)
    })
  }

  private preprocess(imageData: ImageData): OrtType.Tensor {
    const [, channels, height, width] = this.config.inputShape
    const imgWidth = imageData.width
    const imgHeight = imageData.height

    // 縦長画像は90度回転（反時計回り）
    const canvas = new OffscreenCanvas(1, 1)
    const ctx = canvas.getContext('2d')!

    if (imgHeight > imgWidth) {
      canvas.width = imgHeight
      canvas.height = imgWidth
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.translate(-canvas.height / 2, -canvas.width / 2)
    } else {
      canvas.width = imgWidth
      canvas.height = imgHeight
    }

    const tempCanvas = new OffscreenCanvas(imgWidth, imgHeight)
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.putImageData(imageData, 0, 0)
    ctx.drawImage(tempCanvas, 0, 0)

    // モデル入力サイズにリサイズ
    const resizeCanvas = new OffscreenCanvas(width, height)
    const resizeCtx = resizeCanvas.getContext('2d')!
    resizeCtx.drawImage(canvas, 0, 0, width, height)

    const resized = resizeCtx.getImageData(0, 0, width, height)
    const { data } = resized

    // Float32Array: NCHW形式の正規化
    const tensorData = new Float32Array(channels * height * width)
    const { normalization, mean, std } = this.config
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const pixelOffset = (h * width + w) * 4
        for (let c = 0; c < channels; c++) {
          const value = data[pixelOffset + c] / 255.0
          if (normalization === 'custom' && mean && std) {
            // 欧米諸語: (value - mean) / std
            tensorData[c * height * width + h * width + w] = (value - mean[c]) / std[c]
          } else {
            // 日本語: [-1, 1] symmetric normalization
            tensorData[c * height * width + h * width + w] = 2.0 * (value - 0.5)
          }
        }
      }
    }

    return new ort.Tensor('float32', tensorData, this.config.inputShape)
  }

  private decodeOutput(
    outputs: Record<string, OrtType.Tensor>
  ): RecognitionResult {
    try {
      const outputName = this.session!.outputNames[0]
      const rawLogits = outputs[outputName].data as Float32Array
      const logits = Array.from(rawLogits).map((v) =>
        typeof v === 'bigint' ? Number(v) : v
      )

      const dims = outputs[outputName].dims
      const [, seqLength, vocabSize] = dims

      const resultClassIds: number[] = []
      const charConfidences: number[] = []

      if (this.isEuropean) {
        // 欧米諸語: OnnxTR PARSeq — vocab(0..194) + <eos>(195)
        const eosIndex = this.config.charList.length // = 195
        for (let i = 0; i < seqLength; i++) {
          const scores = logits.slice(i * vocabSize, (i + 1) * vocabSize)
          const maxScore = Math.max(...scores)
          const maxIndex = scores.indexOf(maxScore)

          if (maxIndex === eosIndex) break // <eos>

          let sumExp = 0
          for (let j = 0; j < vocabSize; j++) {
            sumExp += Math.exp(scores[j] - maxScore)
          }
          charConfidences.push(1.0 / sumExp)
          resultClassIds.push(maxIndex)
        }
      } else {
        // 日本語: NDL PARSeq — <eos>=0, <s>=1, </s>=2, <pad>=3, then vocab
        for (let i = 0; i < seqLength; i++) {
          const scores = logits.slice(i * vocabSize, (i + 1) * vocabSize)
          const maxScore = Math.max(...scores)
          const maxIndex = scores.indexOf(maxScore)

          if (maxIndex === 0) break // <eos>
          if (maxIndex < 4) continue // skip special tokens

          let sumExp = 0
          for (let j = 0; j < vocabSize; j++) {
            sumExp += Math.exp(scores[j] - maxScore)
          }
          charConfidences.push(1.0 / sumExp)
          resultClassIds.push(maxIndex - 1) // offset by 4 special tokens, but -1 because charset starts at index 3+1=4 mapped to charList[0]
        }
      }

      // 連続重複を除去してテキスト生成
      const resultChars: string[] = []
      const filteredConfidences: number[] = []
      let prevId = -1
      for (let i = 0; i < resultClassIds.length; i++) {
        const id = resultClassIds[i]
        if (id !== prevId && id >= 0 && id < this.config.charList.length) {
          resultChars.push(this.config.charList[id])
          filteredConfidences.push(charConfidences[i])
          prevId = id
        }
      }

      // 全文字の平均信頼度（文字がない場合は0）
      const avgConfidence = filteredConfidences.length > 0
        ? filteredConfidences.reduce((a, b) => a + b, 0) / filteredConfidences.length
        : 0

      return {
        text: resultChars.join('').trim(),
        confidence: avgConfidence,
      }
    } catch (error) {
      console.error('Error decoding output:', error)
      return { text: '', confidence: 0.0 }
    }
  }

  dispose(): void {
    if (this.session) {
      this.session.release()
      this.session = null
    }
    this.initialized = false
  }
}
