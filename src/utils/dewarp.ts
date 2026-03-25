/**
 * Curved Page Dewarping
 *
 * 書籍の綴じ部分の湾曲によるY方向の歪みを検出・補正する。
 * Canvas APIのみで実装、外部ライブラリ依存なし。
 *
 * アルゴリズム:
 *   1. 中央領域の大津の二値化で閾値を決定
 *   2. テキストの縦書き/横書きを自動判定
 *   3. ページを24分割し、各ストリップの曲率を計測
 *   4. ギャップ補間 → 移動平均で平滑化 → 上限キャップ
 *   5. バイリニア補間でピクセルをリマッピング
 *
 * deluxeリポジトリ (somiyagawa/ndlocr-lite-web-ai-deluxe) の
 * src/utils/documentScanner.ts から dewarpPage 関数を抽出。
 */

// ============================================================================
// Internal Helpers
// ============================================================================

function createCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D context')
  return { canvas, ctx }
}

/** Convert RGBA ImageData to single-channel grayscale Float32Array */
function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
  }
  return gray
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 画像の湾曲を補正する。横書き・縦書きの両方に対応。
 *
 * @param imageDataUrl - 入力画像のdata URL
 * @returns 補正後の画像のdata URL
 */
export async function dewarpImage(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!imageDataUrl.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const { canvas, ctx } = createCanvas(img.width, img.height)
        ctx.drawImage(img, 0, 0)
        const inputData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const result = dewarpPage(inputData)
        const outCanvas = document.createElement('canvas')
        outCanvas.width = result.width
        outCanvas.height = result.height
        outCanvas.getContext('2d')!.putImageData(result, 0, 0)
        resolve(outCanvas.toDataURL('image/jpeg', 0.92))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageDataUrl
  })
}

/**
 * Curved page dewarping — unified approach for horizontal & vertical text.
 */
export function dewarpPage(imageData: ImageData): ImageData {
  const { data, width, height } = imageData
  const gray = toGrayscale(imageData)

  // 1. Otsu threshold on central 60% region
  const marginX = Math.round(width * 0.2)
  const marginY = Math.round(height * 0.2)
  const histogram = new Int32Array(256)
  let centralPixelCount = 0
  for (let y = marginY; y < height - marginY; y++) {
    for (let x = marginX; x < width - marginX; x++) {
      histogram[Math.round(gray[y * width + x])]++
      centralPixelCount++
    }
  }
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]
  let sumBg = 0, wBg = 0, maxVariance = 0, threshold = 128
  for (let i = 0; i < 256; i++) {
    wBg += histogram[i]
    if (wBg === 0) continue
    const wFg = centralPixelCount - wBg
    if (wFg === 0) break
    sumBg += i * histogram[i]
    const meanBg = sumBg / wBg
    const meanFg = (sumAll - sumBg) / wFg
    const v = wBg * wFg * (meanBg - meanFg) ** 2
    if (v > maxVariance) { maxVariance = v; threshold = i }
  }
  threshold = Math.min(threshold, 180)

  // 2. Detect text orientation
  const cxStart = Math.round(width * 0.15)
  const cxEnd = Math.round(width * 0.85)
  const cyStart = Math.round(height * 0.15)
  const cyEnd = Math.round(height * 0.85)
  const cw = cxEnd - cxStart
  const ch = cyEnd - cyStart

  const rowProj = new Float32Array(ch)
  for (let y = 0; y < ch; y++) {
    let cnt = 0
    for (let x = 0; x < cw; x++) {
      if (gray[(y + cyStart) * width + (x + cxStart)] < threshold) cnt++
    }
    rowProj[y] = cnt / cw
  }
  const colProj = new Float32Array(cw)
  for (let x = 0; x < cw; x++) {
    let cnt = 0
    for (let y = 0; y < ch; y++) {
      if (gray[(y + cyStart) * width + (x + cxStart)] < threshold) cnt++
    }
    colProj[x] = cnt / ch
  }

  const projVariance = (arr: Float32Array) => {
    let s = 0, sq = 0
    for (let i = 0; i < arr.length; i++) { s += arr[i]; sq += arr[i] * arr[i] }
    const m = s / arr.length
    return sq / arr.length - m * m
  }
  const rowVar = projVariance(rowProj)
  const colVar = projVariance(colProj)
  const isVerticalText = colVar > rowVar * 1.2

  // 3–4. Compute per-strip Y-shifts
  const numSegments = 24
  const segWidth = Math.floor(width / numSegments)
  const shiftSum = new Float32Array(numSegments)
  const shiftCount = new Int32Array(numSegments)

  if (!isVerticalText) {
    // Horizontal text: detect text lines, track Y-position across X-strips
    const smoothedRow = new Float32Array(ch)
    const rowSmooth = Math.max(2, Math.round(ch / 150))
    for (let y = 0; y < ch; y++) {
      let s = 0, c = 0
      for (let k = Math.max(0, y - rowSmooth); k <= Math.min(ch - 1, y + rowSmooth); k++) {
        s += rowProj[k]; c++
      }
      smoothedRow[y] = s / c
    }

    let avgRowDensity = 0
    for (let y = 0; y < ch; y++) avgRowDensity += smoothedRow[y]
    avgRowDensity /= ch
    const peakThresh = avgRowDensity * 1.2

    const textLineYs: number[] = []
    const minLineGap = Math.max(8, Math.round(ch / 40))
    for (let y = 2; y < ch - 2; y++) {
      if (smoothedRow[y] > peakThresh &&
          smoothedRow[y] >= smoothedRow[y - 1] &&
          smoothedRow[y] >= smoothedRow[y + 1]) {
        if (textLineYs.length === 0 || y - textLineYs[textLineYs.length - 1] >= minLineGap) {
          textLineYs.push(y + cyStart)
        }
      }
    }

    if (textLineYs.length < 3) return imageData

    for (const lineY of textLineYs) {
      const searchHalf = Math.max(8, Math.round(height / 50))
      const yMin = Math.max(0, lineY - searchHalf)
      const yMax = Math.min(height - 1, lineY + searchHalf)

      const localYs = new Float32Array(numSegments)
      const localValid = new Uint8Array(numSegments)

      for (let s = 0; s < numSegments; s++) {
        const x0 = s * segWidth
        const x1 = Math.min(x0 + segWidth, width)
        let bestY = lineY, bestDensity = 0

        for (let y = yMin; y <= yMax; y++) {
          let darkCnt = 0
          for (let x = x0; x < x1; x++) {
            if (gray[y * width + x] < threshold) darkCnt++
          }
          if (darkCnt > bestDensity) { bestDensity = darkCnt; bestY = y }
        }

        if (bestDensity > (x1 - x0) * 0.03) {
          localYs[s] = bestY
          localValid[s] = 1
        }
      }

      let meanY = 0, validCnt = 0
      for (let s = 0; s < numSegments; s++) {
        if (localValid[s]) { meanY += localYs[s]; validCnt++ }
      }
      if (validCnt < numSegments * 0.3) continue
      meanY /= validCnt

      for (let s = 0; s < numSegments; s++) {
        if (localValid[s]) {
          shiftSum[s] += localYs[s] - meanY
          shiftCount[s]++
        }
      }
    }
  } else {
    // Vertical text: track text-band edges across vertical strips
    const minDarkRatio = 0.02
    const stripMidYs = new Float32Array(numSegments)
    const stripCentroidYs = new Float32Array(numSegments)
    const stripValid = new Uint8Array(numSegments)
    const centroidValid = new Uint8Array(numSegments)
    const yStart10 = Math.round(height * 0.1)
    const yEnd90 = Math.round(height * 0.9)

    for (let s = 0; s < numSegments; s++) {
      const x0 = s * segWidth
      const x1 = Math.min(x0 + segWidth, width)
      const sw = x1 - x0
      if (sw < 4) continue

      let topEdge = -1, bottomEdge = -1
      let sumY = 0, sumW = 0

      for (let y = 0; y < height; y++) {
        let darkCnt = 0
        for (let x = x0; x < x1; x++) {
          if (gray[y * width + x] < threshold) darkCnt++
        }
        if (darkCnt / sw > minDarkRatio) {
          if (topEdge < 0) topEdge = y
          bottomEdge = y
        }
        if (y >= yStart10 && y < yEnd90) {
          sumY += y * darkCnt
          sumW += darkCnt
        }
      }

      if (topEdge >= 0 && bottomEdge > topEdge + height * 0.1) {
        stripMidYs[s] = (topEdge + bottomEdge) / 2
        stripValid[s] = 1
      }
      if (sumW > 0) {
        stripCentroidYs[s] = sumY / sumW
        centroidValid[s] = 1
      }
    }

    let meanMid = 0, validCnt = 0
    for (let s = 0; s < numSegments; s++) {
      if (stripValid[s]) { meanMid += stripMidYs[s]; validCnt++ }
    }
    if (validCnt < numSegments * 0.3) return imageData
    meanMid /= validCnt

    for (let s = 0; s < numSegments; s++) {
      if (stripValid[s]) {
        shiftSum[s] = stripMidYs[s] - meanMid
        shiftCount[s] = 1
      }
    }

    // Cross-validate with Y-centroid
    let meanCentroid = 0, centroidCnt = 0
    for (let s = 0; s < numSegments; s++) {
      if (centroidValid[s]) { meanCentroid += stripCentroidYs[s]; centroidCnt++ }
    }
    if (centroidCnt > numSegments * 0.3) {
      meanCentroid /= centroidCnt
      for (let s = 0; s < numSegments; s++) {
        if (centroidValid[s]) {
          const centroidShift = stripCentroidYs[s] - meanCentroid
          if (shiftCount[s] > 0) {
            shiftSum[s] = (shiftSum[s] + centroidShift) / 2
          } else {
            shiftSum[s] = centroidShift
            shiftCount[s] = 1
          }
        }
      }
    }
  }

  // 5. Smooth shifts
  const rawShifts = new Float32Array(numSegments)
  for (let s = 0; s < numSegments; s++) {
    rawShifts[s] = shiftCount[s] > 0 ? shiftSum[s] / shiftCount[s] : 0
  }

  // Fill gaps (interpolate from neighbors)
  for (let s = 0; s < numSegments; s++) {
    if (shiftCount[s] === 0) {
      let left = -1, right = -1
      for (let k = s - 1; k >= 0; k--) { if (shiftCount[k] > 0) { left = k; break } }
      for (let k = s + 1; k < numSegments; k++) { if (shiftCount[k] > 0) { right = k; break } }
      if (left >= 0 && right >= 0) {
        const t = (s - left) / (right - left)
        rawShifts[s] = rawShifts[left] * (1 - t) + rawShifts[right] * t
      } else if (left >= 0) {
        rawShifts[s] = rawShifts[left]
      } else if (right >= 0) {
        rawShifts[s] = rawShifts[right]
      }
    }
  }

  const smoothShifts = new Float32Array(numSegments)
  const smoothKernel = 4
  for (let s = 0; s < numSegments; s++) {
    let sum = 0, cnt = 0
    for (let k = Math.max(0, s - smoothKernel); k <= Math.min(numSegments - 1, s + smoothKernel); k++) {
      sum += rawShifts[k]; cnt++
    }
    smoothShifts[s] = sum / cnt
  }

  // Check significance
  let maxShift = 0
  for (let s = 0; s < numSegments; s++) {
    maxShift = Math.max(maxShift, Math.abs(smoothShifts[s]))
  }
  if (maxShift < 1.5) return imageData

  // Cap to reasonable range
  const maxAllowedShift = Math.min(height * 0.05, 40)
  for (let s = 0; s < numSegments; s++) {
    smoothShifts[s] = Math.max(-maxAllowedShift, Math.min(maxAllowedShift, smoothShifts[s]))
  }

  // 6. Remap pixels with bilinear interpolation
  const colShift = new Float32Array(width)
  const invW = (numSegments - 1) / width
  for (let x = 0; x < width; x++) {
    const segF = x * invW
    const s0 = segF | 0
    const s1 = s0 < numSegments - 1 ? s0 + 1 : s0
    const t = segF - s0
    colShift[x] = smoothShifts[s0] * (1 - t) + smoothShifts[s1] * t
  }

  const { ctx } = createCanvas(width, height)
  const outImageData = ctx.createImageData(width, height)
  const outData = outImageData.data
  const w4 = width * 4

  for (let y = 0; y < height; y++) {
    const rowOut = y * w4
    for (let x = 0; x < width; x++) {
      const srcY = y + colShift[x]
      const srcYi = srcY | 0
      const frac = srcY - srcYi

      const di = rowOut + x * 4

      if (srcYi < 0 || srcYi >= height - 1) {
        outData[di] = 255; outData[di + 1] = 255; outData[di + 2] = 255; outData[di + 3] = 255
        continue
      }

      const si0 = srcYi * w4 + x * 4
      const si1 = si0 + w4
      const oneMinusFrac = 1 - frac
      outData[di]     = data[si0]     * oneMinusFrac + data[si1]     * frac + 0.5 | 0
      outData[di + 1] = data[si0 + 1] * oneMinusFrac + data[si1 + 1] * frac + 0.5 | 0
      outData[di + 2] = data[si0 + 2] * oneMinusFrac + data[si1 + 2] * frac + 0.5 | 0
      outData[di + 3] = data[si0 + 3] * oneMinusFrac + data[si1 + 3] * frac + 0.5 | 0
    }
  }

  return outImageData
}
