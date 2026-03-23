import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { Language } from '../../i18n'

export interface PreprocessOptions {
  brightness: number
  contrast: number
  sharpness: number
  grayscale: boolean
  binarize: boolean
  binarizeThreshold: number
  denoise: boolean
  invertColors: boolean
  rotation: number
}

export const DEFAULT_PREPROCESS_OPTIONS: PreprocessOptions = {
  brightness: 0,
  contrast: 0,
  sharpness: 0,
  grayscale: false,
  binarize: false,
  binarizeThreshold: 128,
  denoise: false,
  invertColors: false,
  rotation: 0,
}

interface ImagePreprocessPanelProps {
  lang: Language
  imageDataUrl: string
  onProcessed: (dataUrl: string) => void
  onSplitPages?: (pages: string[]) => void
  onReset: () => void
}

type TranslationStrings = {
  imagePreprocessing: string
  brightness: string
  contrast: string
  sharpness: string
  grayscale: string
  blackWhite: string
  binarizeThreshold: string
  denoise: string
  invertColors: string
  deskewAuto: string
  autoCrop: string
  splitCenter: string
  splitAuto: string
  rotation: string
  apply: string
  reset: string
  degrees: string
  processing: string
}

const t: Record<Language, TranslationStrings> = {
  ja: {
    imagePreprocessing: '画像前処理',
    brightness: '明度',
    contrast: 'コントラスト',
    sharpness: 'シャープネス',
    grayscale: 'グレースケール',
    blackWhite: '白黒（二値化）',
    binarizeThreshold: '二値化閾値',
    denoise: 'ノイズ除去',
    invertColors: '反転',
    deskewAuto: '自動傾き補正',
    autoCrop: '自動裁ち落とし',
    splitCenter: 'センター分割',
    splitAuto: '自動分割',
    rotation: '回転',
    apply: '適用',
    reset: 'リセット',
    degrees: '度',
    processing: '処理中...',
  },
  en: {
    imagePreprocessing: 'Image Preprocessing',
    brightness: 'Brightness',
    contrast: 'Contrast',
    sharpness: 'Sharpness',
    grayscale: 'Grayscale',
    blackWhite: 'Black & White',
    binarizeThreshold: 'Binarize Threshold',
    denoise: 'Denoise',
    invertColors: 'Invert Colors',
    deskewAuto: 'Deskew (auto)',
    autoCrop: 'Auto Crop',
    splitCenter: 'Split Center',
    splitAuto: 'Split Auto',
    rotation: 'Rotation',
    apply: 'Apply',
    reset: 'Reset',
    degrees: '°',
    processing: 'Processing...',
  },
  'zh-CN': {
    imagePreprocessing: '图像预处理',
    brightness: '亮度',
    contrast: '对比度',
    sharpness: '锐度',
    grayscale: '灰度',
    blackWhite: '黑白二值化',
    binarizeThreshold: '二值化阈值',
    denoise: '降噪',
    invertColors: '反转颜色',
    deskewAuto: '自动去斜',
    autoCrop: '自动裁剪',
    splitCenter: '中心分割',
    splitAuto: '自动分割',
    rotation: '旋转',
    apply: '应用',
    reset: '重置',
    degrees: '°',
    processing: '处理中...',
  },
  'zh-TW': {
    imagePreprocessing: '圖像預處理',
    brightness: '亮度',
    contrast: '對比度',
    sharpness: '銳度',
    grayscale: '灰度',
    blackWhite: '黑白二值化',
    binarizeThreshold: '二值化閾值',
    denoise: '降噪',
    invertColors: '反轉顏色',
    deskewAuto: '自動去斜',
    autoCrop: '自動裁剪',
    splitCenter: '中心分割',
    splitAuto: '自動分割',
    rotation: '旋轉',
    apply: '應用',
    reset: '重置',
    degrees: '°',
    processing: '處理中...',
  },
  ko: {
    imagePreprocessing: '이미지 전처리',
    brightness: '밝기',
    contrast: '명암비',
    sharpness: '선명도',
    grayscale: '그레이스케일',
    blackWhite: '검정색 및 흰색',
    binarizeThreshold: '이진화 임계값',
    denoise: '노이즈 제거',
    invertColors: '색 반전',
    deskewAuto: '자동 기울기 보정',
    autoCrop: '자동 자르기',
    splitCenter: '중심 분할',
    splitAuto: '자동 분할',
    rotation: '회전',
    apply: '적용',
    reset: '재설정',
    degrees: '°',
    processing: '처리 중...',
  },
}

// SVG icons
const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 6 8 10 12 6"></polyline>
  </svg>
)

const ChevronUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="12 10 8 6 4 10"></polyline>
  </svg>
)

export function ImagePreprocessPanel({
  lang,
  imageDataUrl,
  onProcessed,
  onSplitPages,
  onReset,
}: ImagePreprocessPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<PreprocessOptions>(DEFAULT_PREPROCESS_OPTIONS)
  const [isProcessing, setIsProcessing] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const strings = t[lang]

  // Debounced preview update
  const updatePreview = useCallback((newOptions: PreprocessOptions) => {
    setIsProcessing(true)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      applyPreprocess(imageDataUrl, newOptions)
        .then((result) => {
          onProcessed(result)
          setIsProcessing(false)
        })
        .catch((err) => {
          console.error('Preprocessing error:', err)
          setIsProcessing(false)
        })
    }, 300)
  }, [imageDataUrl, onProcessed])

  const handleSliderChange = useCallback(
    (key: keyof PreprocessOptions, value: number) => {
      const newOptions = { ...options, [key]: value }
      setOptions(newOptions)
      updatePreview(newOptions)
    },
    [options, updatePreview]
  )

  const handleToggleChange = useCallback(
    (key: keyof PreprocessOptions) => {
      const newOptions = { ...options, [key]: !options[key] }
      setOptions(newOptions)
      updatePreview(newOptions)
    },
    [options, updatePreview]
  )

  const handleApply = useCallback(async () => {
    setIsProcessing(true)
    try {
      const result = await applyPreprocess(imageDataUrl, options)
      onProcessed(result)
    } catch (err) {
      console.error('Apply preprocessing error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageDataUrl, options, onProcessed])

  const handleReset = useCallback(() => {
    setOptions(DEFAULT_PREPROCESS_OPTIONS)
    onReset()
  }, [onReset])

  const handleDeskew = useCallback(async () => {
    setIsProcessing(true)
    try {
      const result = await deskewImage(imageDataUrl)
      onProcessed(result)
    } catch (err) {
      console.error('Deskew error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageDataUrl, onProcessed])

  const handleAutoCrop = useCallback(async () => {
    setIsProcessing(true)
    try {
      const result = await autoCrop(imageDataUrl)
      onProcessed(result)
    } catch (err) {
      console.error('Auto crop error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageDataUrl, onProcessed])

  const handleSplitCenter = useCallback(async () => {
    setIsProcessing(true)
    try {
      const pages = await splitPageCenter(imageDataUrl)
      if (onSplitPages) {
        onSplitPages(pages)
      }
    } catch (err) {
      console.error('Split center error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageDataUrl, onSplitPages])

  const handleSplitAuto = useCallback(async () => {
    setIsProcessing(true)
    try {
      const pages = await splitPageAuto(imageDataUrl)
      if (onSplitPages) {
        onSplitPages(pages)
      }
    } catch (err) {
      console.error('Split auto error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageDataUrl, onSplitPages])

  const sliderControlData = useMemo(() => [
    { key: 'brightness' as const, label: strings.brightness, min: -100, max: 100, step: 1 },
    { key: 'contrast' as const, label: strings.contrast, min: -100, max: 100, step: 1 },
    { key: 'sharpness' as const, label: strings.sharpness, min: 0, max: 100, step: 1 },
    ...(options.binarize ? [{ key: 'binarizeThreshold' as const, label: strings.binarizeThreshold, min: 0, max: 255, step: 1 }] : []),
    { key: 'rotation' as const, label: strings.rotation, min: -5, max: 5, step: 0.5 },
  ], [options.binarize, strings])

  const toggleControlData = useMemo(() => [
    { key: 'grayscale' as const, label: strings.grayscale },
    { key: 'binarize' as const, label: strings.blackWhite },
    { key: 'denoise' as const, label: strings.denoise },
    { key: 'invertColors' as const, label: strings.invertColors },
  ], [strings])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="preprocess-panel">
      <button
        className="preprocess-panel-header"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="preprocess-panel-header-text">{strings.imagePreprocessing}</span>
        <span className="preprocess-panel-header-icon">
          {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </span>
      </button>

      {isOpen && (
        <div className="preprocess-panel-body">
          {/* Slider Controls */}
          <div className="preprocess-controls">
            <label className="preprocess-controls-group-label">
              {lang === 'ja' ? 'スライダー' : 'Adjustments'}
            </label>
            {sliderControlData.map(({ key, label, min, max, step }) => (
              <div key={key} className="preprocess-slider">
                <label htmlFor={`slider-${key}`}>
                  <span>{label}</span>
                  <span className="preprocess-slider-value">{options[key]}{key === 'rotation' ? strings.degrees : ''}</span>
                </label>
                <input
                  id={`slider-${key}`}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={options[key]}
                  onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                  disabled={isProcessing}
                />
              </div>
            ))}
          </div>

          {/* Toggle Controls */}
          <div className="preprocess-toggles">
            {toggleControlData.map(({ key, label }) => (
              <label key={key} className="preprocess-toggle">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={() => handleToggleChange(key)}
                  disabled={isProcessing}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="preprocess-actions">
            <button
              className="preprocess-btn preprocess-btn-secondary"
              onClick={handleDeskew}
              disabled={isProcessing}
              type="button"
            >
              {isProcessing ? strings.processing : strings.deskewAuto}
            </button>
            <button
              className="preprocess-btn preprocess-btn-secondary"
              onClick={handleAutoCrop}
              disabled={isProcessing}
              type="button"
            >
              {isProcessing ? strings.processing : strings.autoCrop}
            </button>
          </div>

          {/* Split Actions */}
          <div className="preprocess-actions">
            <button
              className="preprocess-btn preprocess-btn-secondary"
              onClick={handleSplitCenter}
              disabled={isProcessing || !onSplitPages}
              type="button"
            >
              {isProcessing ? strings.processing : strings.splitCenter}
            </button>
            <button
              className="preprocess-btn preprocess-btn-secondary"
              onClick={handleSplitAuto}
              disabled={isProcessing || !onSplitPages}
              type="button"
            >
              {isProcessing ? strings.processing : strings.splitAuto}
            </button>
          </div>

          {/* Apply/Reset Actions */}
          <div className="preprocess-actions">
            <button
              className="preprocess-btn preprocess-btn-primary"
              onClick={handleApply}
              disabled={isProcessing}
              type="button"
            >
              {isProcessing ? strings.processing : strings.apply}
            </button>
            <button
              className="preprocess-btn preprocess-btn-secondary"
              onClick={handleReset}
              disabled={isProcessing}
              type="button"
            >
              {strings.reset}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Image Processing Utility Functions
// =====================================================

async function applyPreprocess(
  imageDataUrl: string,
  options: PreprocessOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get canvas context')

        // Draw image with rotation
        if (options.rotation !== 0) {
          ctx.translate(canvas.width / 2, canvas.height / 2)
          ctx.rotate((options.rotation * Math.PI) / 180)
          ctx.translate(-canvas.width / 2, -canvas.height / 2)
        }

        ctx.drawImage(img, 0, 0)

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        // Apply filters
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i]
          let g = data[i + 1]
          let b = data[i + 2]
          let a = data[i + 3]

          // Grayscale
          if (options.grayscale) {
            const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114)
            r = g = b = gray
          }

          // Invert colors
          if (options.invertColors) {
            r = 255 - r
            g = 255 - g
            b = 255 - b
          }

          // Brightness
          if (options.brightness !== 0) {
            r = Math.max(0, Math.min(255, r + options.brightness))
            g = Math.max(0, Math.min(255, g + options.brightness))
            b = Math.max(0, Math.min(255, b + options.brightness))
          }

          // Contrast
          if (options.contrast !== 0) {
            const factor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast))
            r = Math.max(0, Math.min(255, factor * (r - 128) + 128))
            g = Math.max(0, Math.min(255, factor * (g - 128) + 128))
            b = Math.max(0, Math.min(255, factor * (b - 128) + 128))
          }

          // Binarize
          if (options.binarize) {
            const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114)
            const bw = gray > options.binarizeThreshold ? 255 : 0
            r = g = b = bw
          }

          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = a
        }

        // Apply sharpness via convolution
        if (options.sharpness > 0) {
          applySharpness(imageData, options.sharpness)
        }

        // Apply denoise
        if (options.denoise) {
          applyDenoise(imageData)
        }

        ctx.putImageData(imageData, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageDataUrl
  })
}

function applySharpness(imageData: ImageData, amount: number): void {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height
  const kernel = [0, -1, 0, -1, 4 + amount * 0.1, -1, 0, -1, 0]
  const divisor = 4 + amount * 0.1

  const tempData = new Uint8ClampedArray(data)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c
            sum += tempData[idx] * kernel[(ky + 1) * 3 + (kx + 1)]
          }
        }
        const idx = (y * width + x) * 4 + c
        data[idx] = Math.max(0, Math.min(255, sum / divisor))
      }
    }
  }
}

function applyDenoise(imageData: ImageData): void {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height
  const tempData = new Uint8ClampedArray(data)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const neighbors: number[] = []
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c
            neighbors.push(tempData[idx])
          }
        }
        neighbors.sort((a, b) => a - b)
        const median = neighbors[4]
        const idx = (y * width + x) * 4 + c
        data[idx] = median
      }
    }
  }
}

async function deskewImage(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get canvas context')

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Simple deskew: detect edges and estimate angle
        const angle = estimateSkewAngle(imageData)

        const deskewCanvas = document.createElement('canvas')
        const deskewCtx = deskewCanvas.getContext('2d')
        if (!deskewCtx) throw new Error('Failed to get deskew context')

        deskewCanvas.width = canvas.width
        deskewCanvas.height = canvas.height

        deskewCtx.translate(canvas.width / 2, canvas.height / 2)
        deskewCtx.rotate((angle * Math.PI) / 180)
        deskewCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)

        resolve(deskewCanvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageDataUrl
  })
}

function estimateSkewAngle(imageData: ImageData): number {
  // Projection profile method: test rotations from -5 to +5 degrees,
  // find the angle that maximizes horizontal projection variance
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height

  // Convert to binary row projection at the original angle first
  const getProjectionVariance = (angleDeg: number): number => {
    const angleRad = (angleDeg * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const cx = width / 2
    const cy = height / 2

    // Count dark pixels per row after virtual rotation
    const rowCounts = new Int32Array(height)
    // Sample every 2nd pixel for speed
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        // Rotate point back to find source
        const dx = x - cx
        const dy = y - cy
        const sx = Math.round(cosA * dx + sinA * dy + cx)
        const sy = Math.round(-sinA * dx + cosA * dy + cy)
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const idx = (sy * width + sx) * 4
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
          if (brightness < 160) rowCounts[y]++
        }
      }
    }

    // Calculate variance of row counts
    let sum = 0
    let sumSq = 0
    let count = 0
    for (let y = 0; y < height; y += 2) {
      sum += rowCounts[y]
      sumSq += rowCounts[y] * rowCounts[y]
      count++
    }
    if (count === 0) return 0
    const mean = sum / count
    return sumSq / count - mean * mean
  }

  let bestAngle = 0
  let bestVariance = 0

  // Coarse search: -5 to +5 in 0.5 deg steps
  for (let angle = -5; angle <= 5; angle += 0.5) {
    const v = getProjectionVariance(angle)
    if (v > bestVariance) {
      bestVariance = v
      bestAngle = angle
    }
  }

  // Fine search around best: ±0.5 in 0.1 deg steps
  const fineStart = bestAngle - 0.5
  const fineEnd = bestAngle + 0.5
  for (let angle = fineStart; angle <= fineEnd; angle += 0.1) {
    const v = getProjectionVariance(angle)
    if (v > bestVariance) {
      bestVariance = v
      bestAngle = angle
    }
  }

  // Return negative to counter the detected skew
  return -bestAngle
}

async function autoCrop(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get canvas context')

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const bounds = findContentBounds(imageData)

        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = bounds.right - bounds.left
        croppedCanvas.height = bounds.bottom - bounds.top

        const croppedCtx = croppedCanvas.getContext('2d')
        if (!croppedCtx) throw new Error('Failed to get cropped context')

        croppedCtx.drawImage(
          canvas,
          bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
          0, 0, bounds.right - bounds.left, bounds.bottom - bounds.top
        )

        resolve(croppedCanvas.toDataURL('image/png'))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageDataUrl
  })
}

interface Bounds {
  left: number
  right: number
  top: number
  bottom: number
}

function findContentBounds(imageData: ImageData): Bounds {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height

  let minX = width, maxX = 0
  let minY = height, maxY = 0
  const threshold = 240

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const brightness = (r + g + b) / 3

      if (brightness < threshold) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }

  return {
    left: Math.max(0, minX - 10),
    right: Math.min(width, maxX + 10),
    top: Math.max(0, minY - 10),
    bottom: Math.min(height, maxY + 10),
  }
}

async function splitPageCenter(imageDataUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const centerX = img.width / 2
        const leftCanvas = document.createElement('canvas')
        leftCanvas.width = centerX
        leftCanvas.height = img.height

        const rightCanvas = document.createElement('canvas')
        rightCanvas.width = img.width - centerX
        rightCanvas.height = img.height

        const leftCtx = leftCanvas.getContext('2d')
        const rightCtx = rightCanvas.getContext('2d')

        if (!leftCtx || !rightCtx) {
          throw new Error('Failed to get canvas context')
        }

        leftCtx.drawImage(img, 0, 0, centerX, img.height, 0, 0, centerX, img.height)
        rightCtx.drawImage(img, centerX, 0, img.width - centerX, img.height, 0, 0, img.width - centerX, img.height)

        resolve([
          leftCanvas.toDataURL('image/png'),
          rightCanvas.toDataURL('image/png'),
        ])
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageDataUrl
  })
}

async function splitPageAuto(imageDataUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get canvas context')

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Find vertical line with most whitespace
        const splitX = findAutoSplitPosition(imageData)

        const leftCanvas = document.createElement('canvas')
        leftCanvas.width = splitX
        leftCanvas.height = img.height

        const rightCanvas = document.createElement('canvas')
        rightCanvas.width = img.width - splitX
        rightCanvas.height = img.height

        const leftCtx = leftCanvas.getContext('2d')
        const rightCtx = rightCanvas.getContext('2d')

        if (!leftCtx || !rightCtx) {
          throw new Error('Failed to get canvas context')
        }

        leftCtx.drawImage(img, 0, 0, splitX, img.height, 0, 0, splitX, img.height)
        rightCtx.drawImage(img, splitX, 0, img.width - splitX, img.height, 0, 0, img.width - splitX, img.height)

        resolve([
          leftCanvas.toDataURL('image/png'),
          rightCanvas.toDataURL('image/png'),
        ])
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageDataUrl
  })
}

function findAutoSplitPosition(imageData: ImageData): number {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height

  let maxWhitespace = 0
  let splitPos = width / 2

  // Find vertical line with most white pixels
  for (let x = width * 0.3; x < width * 0.7; x++) {
    let whitespace = 0
    for (let y = 0; y < height; y++) {
      const idx = (y * width + Math.floor(x)) * 4
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      if (brightness > 200) whitespace++
    }
    if (whitespace > maxWhitespace) {
      maxWhitespace = whitespace
      splitPos = x
    }
  }

  return Math.floor(splitPos)
}
