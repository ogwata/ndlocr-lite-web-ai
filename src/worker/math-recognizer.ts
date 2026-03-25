/**
 * 数式認識モジュール（pix2text-mfr: DeiT encoder + TrOCR decoder）
 *
 * 数式画像をLaTeX文字列に変換する。
 * - Encoder: DeiT (384x384入力, パッチサイズ16, 577トークン出力)
 * - Decoder: TrOCR (自己回帰的にLaTeXトークンを生成)
 * - トークナイザー: BPE (tokenizer.json から語彙を構築)
 *
 * モデル: https://huggingface.co/breezedeus/pix2text-mfr
 */

import type * as OrtType from 'onnxruntime-web'
import { ort, createSession } from './onnx-config'

/** BPEトークナイザーの語彙エントリ */
interface TokenizerVocab {
  [token: string]: number
}

/** トークナイザー設定 */
interface TokenizerConfig {
  vocab: TokenizerVocab
  idToToken: Map<number, string>
  bosTokenId: number
  eosTokenId: number
  padTokenId: number
  decoderStartTokenId: number
}

export class MathRecognizer {
  private encoderSession: OrtType.InferenceSession | null = null
  private decoderSession: OrtType.InferenceSession | null = null
  private tokenizer: TokenizerConfig | null = null
  private initialized = false

  /** 最大生成トークン数 */
  private readonly maxNewTokens = 512
  /** 入力画像サイズ */
  private readonly imageSize = 384

  async initialize(
    encoderData: ArrayBuffer,
    decoderData: ArrayBuffer,
    tokenizerJson: string
  ): Promise<void> {
    if (this.initialized) return

    try {
      this.encoderSession = await createSession(encoderData)
      this.decoderSession = await createSession(decoderData)
      this.tokenizer = this.parseTokenizer(tokenizerJson)
      this.initialized = true
      console.log('Math recognizer initialized successfully')
    } catch (error) {
      console.error('Failed to initialize math recognizer:', error)
      throw error
    }
  }

  /**
   * 数式画像をLaTeX文字列に変換
   */
  async recognize(imageData: ImageData): Promise<string> {
    if (!this.initialized || !this.encoderSession || !this.decoderSession || !this.tokenizer) {
      throw new Error('Math recognizer not initialized')
    }

    // 1. 画像を前処理 → encoder入力テンソル
    const pixelValues = this.preprocessImage(imageData)

    // 2. Encoder forward pass
    const encoderOutput = await this.encoderSession.run({
      [this.encoderSession.inputNames[0]]: pixelValues,
    })
    const encoderHiddenStates = encoderOutput[this.encoderSession.outputNames[0]]

    // 3. 自己回帰デコーディング（greedy）
    const tokenIds = await this.greedyDecode(encoderHiddenStates)

    // 4. トークンIDをLaTeX文字列にデコード
    return this.decodeTokens(tokenIds)
  }

  /**
   * 画像を384x384にリサイズし、[-1, 1]に正規化
   */
  private preprocessImage(imageData: ImageData): OrtType.Tensor {
    const canvas = new OffscreenCanvas(this.imageSize, this.imageSize)
    const ctx = canvas.getContext('2d')!

    // 元画像をキャンバスに描画
    const srcCanvas = new OffscreenCanvas(imageData.width, imageData.height)
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.putImageData(imageData, 0, 0)

    // 384x384にリサイズ
    ctx.drawImage(srcCanvas, 0, 0, this.imageSize, this.imageSize)
    const resized = ctx.getImageData(0, 0, this.imageSize, this.imageSize)
    const { data } = resized

    // NCHW形式、(pixel/255 - 0.5) / 0.5 = pixel/127.5 - 1.0
    const tensorData = new Float32Array(3 * this.imageSize * this.imageSize)
    for (let h = 0; h < this.imageSize; h++) {
      for (let w = 0; w < this.imageSize; w++) {
        const pixelOffset = (h * this.imageSize + w) * 4
        for (let c = 0; c < 3; c++) {
          tensorData[c * this.imageSize * this.imageSize + h * this.imageSize + w] =
            data[pixelOffset + c] / 127.5 - 1.0
        }
      }
    }

    return new ort.Tensor('float32', tensorData, [1, 3, this.imageSize, this.imageSize])
  }

  /**
   * Greedy autoregressive decoding
   */
  private async greedyDecode(encoderHiddenStates: OrtType.Tensor): Promise<number[]> {
    const { decoderStartTokenId, eosTokenId } = this.tokenizer!
    const tokenIds: number[] = [decoderStartTokenId]

    for (let step = 0; step < this.maxNewTokens; step++) {
      // decoder入力: input_ids [1, seq_len] as int64
      const inputIds = new BigInt64Array(tokenIds.length)
      for (let i = 0; i < tokenIds.length; i++) {
        inputIds[i] = BigInt(tokenIds[i])
      }

      const decoderOutput = await this.decoderSession!.run({
        input_ids: new ort.Tensor('int64', inputIds, [1, tokenIds.length]),
        encoder_hidden_states: encoderHiddenStates,
      })

      // logits: [1, seq_len, vocab_size] — 最後のタイムステップのlogitsからargmax
      const logits = decoderOutput[this.decoderSession!.outputNames[0]]
      const logitsData = logits.data as Float32Array
      const vocabSize = logits.dims[2]
      const lastStepOffset = (tokenIds.length - 1) * vocabSize

      let maxIdx = 0
      let maxVal = -Infinity
      for (let i = 0; i < vocabSize; i++) {
        const val = logitsData[lastStepOffset + i]
        if (val > maxVal) {
          maxVal = val
          maxIdx = i
        }
      }

      if (maxIdx === eosTokenId) break
      tokenIds.push(maxIdx)
    }

    return tokenIds
  }

  /**
   * tokenizer.jsonからBPE語彙を解析
   */
  private parseTokenizer(json: string): TokenizerConfig {
    const parsed = JSON.parse(json)

    // tokenizer.json の model.vocab からID→トークンマップを構築
    const vocab: TokenizerVocab = parsed.model?.vocab ?? {}
    const idToToken = new Map<number, string>()
    for (const [token, id] of Object.entries(vocab)) {
      idToToken.set(id as number, token)
    }

    // added_tokens からも追加
    if (parsed.added_tokens) {
      for (const entry of parsed.added_tokens) {
        idToToken.set(entry.id, entry.content)
      }
    }

    return {
      vocab,
      idToToken,
      bosTokenId: 1,
      eosTokenId: 2,
      padTokenId: 0,
      decoderStartTokenId: 2, // pix2text-mfr v1.0 uses EOS as decoder start
    }
  }

  /**
   * トークンIDをLaTeX文字列にデコード
   */
  private decodeTokens(tokenIds: number[]): string {
    if (!this.tokenizer) return ''

    const tokens: string[] = []
    const specialIds = new Set([
      this.tokenizer.bosTokenId,
      this.tokenizer.eosTokenId,
      this.tokenizer.padTokenId,
    ])

    for (const id of tokenIds) {
      if (specialIds.has(id)) continue
      const token = this.tokenizer.idToToken.get(id)
      if (token) tokens.push(token)
    }

    // BPEのsentencepiece方式: ▁ (U+2581) をスペースに変換
    return tokens.join('')
      .replace(/▁/g, ' ')
      .trim()
  }

  dispose(): void {
    this.encoderSession?.release()
    this.decoderSession?.release()
    this.encoderSession = null
    this.decoderSession = null
    this.tokenizer = null
    this.initialized = false
  }
}
