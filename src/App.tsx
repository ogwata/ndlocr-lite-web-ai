import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import type { OCRResult, TextBlock, BoundingBox, PageBlock } from './types/ocr'
import type { DBRunEntry } from './types/db'
import { useI18n } from './hooks/useI18n'
import { useOCRWorker } from './hooks/useOCRWorker'
import { useFileProcessor } from './hooks/useFileProcessor'
import { useResultCache } from './hooks/useResultCache'
import { useAISettings } from './hooks/useAISettings'
import { useTheme } from './hooks/useTheme'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { SplitView } from './components/layout/SplitView'
import { BottomToolbar } from './components/layout/BottomToolbar'
import { FileDropZone } from './components/upload/FileDropZone'
import { DirectoryPicker } from './components/upload/DirectoryPicker'
import { ProgressBar } from './components/progress/ProgressBar'
import { ImageViewer } from './components/viewer/ImageViewer'
import { TextEditor } from './components/editor/TextEditor'
const ImagePreprocessPanel = lazy(() => import('./components/viewer/ImagePreprocessPanel').then(m => ({ default: m.ImagePreprocessPanel })))
const HistoryPanel = lazy(() => import('./components/results/HistoryPanel').then(m => ({ default: m.HistoryPanel })))
const SettingsModal = lazy(() => import('./components/settings/SettingsModal').then(m => ({ default: m.SettingsModal })))
import { loadModelConfig, loadDocumentLanguage, saveDocumentLanguage, getRecognitionLanguage, DOCUMENT_LANGUAGE_OPTIONS, DOCUMENT_LANGUAGE_NAMES } from './types/model-config'
import type { ModelConfig, DocumentLanguage } from './types/model-config'
import { buildProofreadPrompt } from './types/ai'
import { imageDataToDataUrl } from './utils/imageLoader'
import './App.css'

function cropRegion(srcDataUrl: string, bbox: BoundingBox) {
  return new Promise<{ previewDataUrl: string; imageData: ImageData }>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = Math.max(1, Math.round(bbox.width))
      const h = Math.max(1, Math.round(bbox.height))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, w, h)
      resolve({
        previewDataUrl: canvas.toDataURL('image/jpeg', 0.9),
        imageData: ctx.getImageData(0, 0, w, h),
      })
    }
    img.src = srcDataUrl
  })
}

export default function App() {
  const { lang, toggleLanguage } = useI18n()
  const { isReady, jobState, processImage, processRegion, resetState, ensureLanguage } = useOCRWorker()
  const { processedImages, isLoading: isLoadingFiles, processFiles, appendFiles, clearImages, removeImage, fileLoadingState } = useFileProcessor()
  const addFileInputRef = useRef<HTMLInputElement>(null)
  const { runs: historyRuns, saveRun, clearResults } = useResultCache()
  const {
    settings: aiSettings,
    updateSettings: updateAISettings,
    switchProvider,
    connectionStatus: aiConnectionStatus,
    testAndConnect,
    getConnector,
  } = useAISettings()

  const { theme, toggleTheme } = useTheme()
  const [modelConfig, setModelConfig] = useState<ModelConfig>(loadModelConfig)
  const [documentLanguage, setDocumentLanguage] = useState<DocumentLanguage>(loadDocumentLanguage)

  const handleDocumentLanguageChange = useCallback((lang: DocumentLanguage) => {
    setDocumentLanguage(lang)
    saveDocumentLanguage(lang)
  }, [])

  const [sessionResults, setSessionResults] = useState<OCRResult[]>([])
  const [selectedResultIndex, setSelectedResultIndex] = useState(0)
  const [selectedBlocks, setSelectedBlocks] = useState<Set<number>>(new Set())
  const lastBlockClickRef = useRef<number>(-1)
  const [selectedPageBlock, setSelectedPageBlock] = useState<PageBlock | null>(null)
  const [excludedBlocksMap, setExcludedBlocksMap] = useState<Record<string, Set<number>>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isReadyToProcess, setIsReadyToProcess] = useState(false)
  const [mathResult, setMathResult] = useState<{ latex: string; imageUrl: string } | null>(null)
  const [isMathProcessing, setIsMathProcessing] = useState(false)
  const [pendingImageIndex, setPendingImageIndex] = useState(0)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [resultSelectedIndices, setResultSelectedIndices] = useState<Set<number>>(new Set())
  const [mergedEditDirty, setMergedEditDirty] = useState(false)
  const lastClickedIndexRef = useRef<number>(0)
  const resultLastClickedIndexRef = useRef<number>(0)
  const cancelRef = useRef(false)

  // サイドバーのクリックハンドラ（Cmd/Ctrl+クリック、Shift+クリック対応）
  const handleSidebarClick = useCallback((index: number, e: React.MouseEvent) => {
    const isMetaKey = e.metaKey || e.ctrlKey

    if (isMetaKey) {
      // Cmd/Ctrl+クリック: トグル選択
      setSelectedIndices(prev => {
        const next = new Set(prev)
        if (next.has(index)) {
          next.delete(index)
        } else {
          next.add(index)
        }
        return next
      })
      lastClickedIndexRef.current = index
    } else if (e.shiftKey) {
      // Shift+クリック: 範囲選択
      const start = Math.min(lastClickedIndexRef.current, index)
      const end = Math.max(lastClickedIndexRef.current, index)
      setSelectedIndices(prev => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(i)
        }
        return next
      })
    } else {
      // 通常クリック: 単一選択（表示切替のみ、複数選択はクリア）
      setSelectedIndices(new Set())
      lastClickedIndexRef.current = index
    }

    setPendingImageIndex(index)
    setSelectedRegion(null)
  }, [])

  // 結果サイドバーのクリックハンドラ（Cmd/Ctrl+クリック、Shift+クリック対応）
  const handleResultSidebarClick = useCallback((index: number, e: React.MouseEvent) => {
    const isMetaKey = e.metaKey || e.ctrlKey

    if (isMetaKey) {
      setResultSelectedIndices(prev => {
        const next = new Set(prev)
        if (next.has(index)) {
          next.delete(index)
        } else {
          next.add(index)
        }
        return next
      })
      resultLastClickedIndexRef.current = index
    } else if (e.shiftKey) {
      const start = Math.min(resultLastClickedIndexRef.current, index)
      const end = Math.max(resultLastClickedIndexRef.current, index)
      setResultSelectedIndices(prev => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(i)
        }
        return next
      })
    } else {
      // 通常クリック: 結合モードから単一に戻る場合、編集済みなら確認
      if (resultSelectedIndices.size >= 2 && mergedEditDirty) {
        const msg = lang === 'ja'
          ? '結合テキストの編集内容は破棄されます。よろしいですか？'
          : 'Edits to the merged text will be discarded. Continue?'
        if (!window.confirm(msg)) return
      }
      setResultSelectedIndices(new Set())
      setMergedEditDirty(false)
      resultLastClickedIndexRef.current = index
    }

    if (sessionResults[index]) {
      setSelectedResultIndex(index)
      setSelectedBlocks(new Set())
      setSelectedRegion(null)
    }
  }, [sessionResults, resultSelectedIndices.size, mergedEditDirty, lang])

  // サイドバー: 個別画像削除
  const handleRemoveImage = useCallback((index: number) => {
    removeImage(index)
    setPreprocessedUrls({})
    // 結果画面の場合、sessionResultsも連動削除
    setSessionResults(prev => {
      if (prev.length === 0) return prev
      return prev.filter((_, i) => i !== index)
    })
  }, [removeImage])

  // サイドバー: 全画像削除
  const handleClearAllImages = useCallback(() => {
    const msg = lang === 'ja'
      ? 'すべての画像を削除しますか？'
      : 'Delete all images?'
    if (!window.confirm(msg)) return
    clearImages()
    setSessionResults([])
    setSelectedResultIndex(0)
    setSelectedBlocks(new Set())
    setSelectedPageBlock(null)
    setSelectedRegion(null)
    setPreprocessedUrls({})
    resetState()
    setIsProcessing(false)
    setIsReadyToProcess(false)
    setPendingImageIndex(0)
  }, [lang, clearImages, resetState])

  // サイドバー: 画像追加
  const handleAddFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await appendFiles(Array.from(files))
    e.target.value = ''
  }, [appendFiles])

  // 一括テキスト出力
  const handleBatchTextExport = useCallback(() => {
    const indices = resultSelectedIndices.size > 0
      ? Array.from(resultSelectedIndices).sort((a, b) => a - b)
      : sessionResults.map((_, i) => i)

    const parts: string[] = []
    for (const i of indices) {
      const result = sessionResults[i]
      if (!result) continue
      const img = processedImages[i]
      const label = img?.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : (img?.fileName ?? `page ${i + 1}`)
      const line = `──────────── ${label} ────────────`
      const excluded = excludedBlocksMap[result.id] ?? new Set<number>()
      const text = result.textBlocks
        .filter(b => !excluded.has(b.readingOrder))
        .slice()
        .sort((a, b) => a.readingOrder - b.readingOrder)
        .map(b => b.text)
        .join('\n')
      parts.push(line + '\n' + text)
    }

    const output = parts.join('\n\n')
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ocr-batch-result.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [resultSelectedIndices, sessionResults, processedImages, excludedBlocksMap])

  // 領域選択状態
  const [selectedRegion, setSelectedRegion] = useState<BoundingBox | null>(null)

  // 画像前処理状態
  const [preprocessedUrls, setPreprocessedUrls] = useState<Record<number, string>>({})

  const handlePreprocessed = useCallback((index: number, dataUrl: string) => {
    setPreprocessedUrls(prev => ({ ...prev, [index]: dataUrl }))
  }, [])

  const handlePreprocessReset = useCallback((index: number) => {
    setPreprocessedUrls(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }, [])

  // pending 状態での ImageViewer 表示用（全解像度 DataUrl）
  const pendingDataUrls = useMemo(
    () => processedImages.map((img) => imageDataToDataUrl(img.imageData)),
    [processedImages]
  )

  const handlePreprocessAll = useCallback(async (opts: import('./components/viewer/ImagePreprocessPanel').PreprocessOptions) => {
    const { applyPreprocess } = await import('./components/viewer/ImagePreprocessPanel')
    const results: Record<number, string> = {}
    for (let i = 0; i < pendingDataUrls.length; i++) {
      const url = pendingDataUrls[i]
      if (url) {
        try {
          results[i] = await applyPreprocess(url, opts)
        } catch (err) {
          console.error(`Batch preprocess error on image ${i}:`, err)
        }
      }
    }
    setPreprocessedUrls(prev => ({ ...prev, ...results }))
  }, [pendingDataUrls])

  // processedImages が差し替わったらインデックスをリセット
  useEffect(() => { setPendingImageIndex(0); setSelectedIndices(new Set()) }, [processedImages])

  const currentResult = sessionResults[selectedResultIndex] ?? null

  // 除外ブロック管理
  const currentExcludedBlocks = useMemo(
    () => currentResult ? (excludedBlocksMap[currentResult.id] ?? new Set<number>()) : new Set<number>(),
    [currentResult, excludedBlocksMap]
  )

  // 除外ブロックを反映した結果（単一表示用）
  const effectiveResult = useMemo<OCRResult | null>(() => {
    if (!currentResult || currentExcludedBlocks.size === 0) return currentResult
    const filteredBlocks = currentResult.textBlocks.filter(b => !currentExcludedBlocks.has(b.readingOrder))
    return {
      ...currentResult,
      id: `${currentResult.id}-ex${Array.from(currentExcludedBlocks).sort().join(',')}`,
      textBlocks: filteredBlocks,
      fullText: filteredBlocks
        .slice()
        .sort((a, b) => a.readingOrder - b.readingOrder)
        .map(b => b.text)
        .join('\n'),
    }
  }, [currentResult, currentExcludedBlocks])

  // ブロッククリックハンドラ（Cmd/Ctrl+クリック、Shift+クリック対応）
  const handleBlockClick = useCallback((readingOrder: number, e: React.MouseEvent) => {
    const isMetaKey = e.metaKey || e.ctrlKey

    if (isMetaKey) {
      setSelectedBlocks(prev => {
        const next = new Set(prev)
        if (next.has(readingOrder)) next.delete(readingOrder)
        else next.add(readingOrder)
        return next
      })
      lastBlockClickRef.current = readingOrder
    } else if (e.shiftKey && lastBlockClickRef.current >= 0) {
      const start = Math.min(lastBlockClickRef.current, readingOrder)
      const end = Math.max(lastBlockClickRef.current, readingOrder)
      setSelectedBlocks(prev => {
        const next = new Set(prev)
        if (currentResult) {
          for (const b of currentResult.textBlocks) {
            if (b.readingOrder >= start && b.readingOrder <= end) next.add(b.readingOrder)
          }
        }
        return next
      })
    } else {
      setSelectedBlocks(new Set([readingOrder]))
      lastBlockClickRef.current = readingOrder
    }
    setSelectedPageBlock(null)
  }, [currentResult])

  // 選択ブロックを除外
  const handleExcludeBlocks = useCallback(() => {
    if (!currentResult || selectedBlocks.size === 0) return
    setExcludedBlocksMap(prev => {
      const current = prev[currentResult.id] ?? new Set<number>()
      return { ...prev, [currentResult.id]: new Set([...current, ...selectedBlocks]) }
    })
    setSelectedBlocks(new Set())
  }, [currentResult, selectedBlocks])

  // 除外ブロックを復活
  const handleRestoreBlocks = useCallback(() => {
    if (!currentResult || selectedBlocks.size === 0) return
    setExcludedBlocksMap(prev => {
      const current = prev[currentResult.id] ?? new Set<number>()
      const next = new Set(current)
      for (const ro of selectedBlocks) next.delete(ro)
      return { ...prev, [currentResult.id]: next }
    })
    setSelectedBlocks(new Set())
  }, [currentResult, selectedBlocks])

  // 選択中のブロック情報
  const selectedBlocksInfo = useMemo(() => {
    if (selectedBlocks.size === 0 || !currentResult) return null
    const blocks = currentResult.textBlocks.filter(b => selectedBlocks.has(b.readingOrder))
    const hasExcluded = blocks.some(b => currentExcludedBlocks.has(b.readingOrder))
    const hasNonExcluded = blocks.some(b => !currentExcludedBlocks.has(b.readingOrder))
    const text = blocks
      .slice()
      .sort((a, b) => a.readingOrder - b.readingOrder)
      .map(b => b.text)
      .join('\n')
    return { count: blocks.length, text, hasExcluded, hasNonExcluded }
  }, [selectedBlocks, currentResult, currentExcludedBlocks])

  // 除外を全て復活
  const handleRestoreAllBlocks = useCallback(() => {
    if (!currentResult) return
    setExcludedBlocksMap(prev => {
      const next = { ...prev }
      delete next[currentResult.id]
      return next
    })
  }, [currentResult])

  // 結合表示用の仮想OCRResult
  const mergedResult = useMemo<OCRResult | null>(() => {
    if (resultSelectedIndices.size < 2) return null
    const indices = Array.from(resultSelectedIndices).sort((a, b) => a - b)
    const parts: string[] = []
    for (const i of indices) {
      const result = sessionResults[i]
      if (!result) continue
      const img = processedImages[i]
      const label = img?.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : (img?.fileName ?? `page ${i + 1}`)
      const line = `──────────── ${label} ────────────`
      const excluded = excludedBlocksMap[result.id] ?? new Set<number>()
      const text = result.textBlocks
        .filter(b => !excluded.has(b.readingOrder))
        .slice()
        .sort((a, b) => a.readingOrder - b.readingOrder)
        .map(b => b.text)
        .join('\n')
      parts.push(line + '\n' + text)
    }
    return {
      id: `merged-${Array.from(indices).join('-')}-ex${Array.from(Object.entries(excludedBlocksMap).flatMap(([k, v]) => Array.from(v).map(r => `${k}:${r}`))).sort().join(',')}`,
      fileName: `merged-${indices.length}-pages`,
      imageDataUrl: '',
      textBlocks: [],
      fullText: parts.join('\n\n'),
      processingTimeMs: 0,
      createdAt: Date.now(),
    }
  }, [resultSelectedIndices, sessionResults, processedImages, excludedBlocksMap])

  const isMergedMode = mergedResult !== null
  const editorResult = isMergedMode ? mergedResult : effectiveResult

  // 結合モード用: 各セクションの画像URL・テキスト・ラベル
  const mergedSections = useMemo(() => {
    if (resultSelectedIndices.size < 2) return undefined
    const indices = Array.from(resultSelectedIndices).sort((a, b) => a - b)
    return indices
      .map(i => {
        const result = sessionResults[i]
        if (!result) return null
        const img = processedImages[i]
        const label = img?.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : (img?.fileName ?? `page ${i + 1}`)
        const excluded = excludedBlocksMap[result.id] ?? new Set<number>()
        const text = result.textBlocks
          .filter(b => !excluded.has(b.readingOrder))
          .slice()
          .sort((a, b) => a.readingOrder - b.readingOrder)
          .map(b => b.text)
          .join('\n')
        return { imageDataUrl: result.imageDataUrl, text, label }
      })
      .filter((s): s is { imageDataUrl: string; text: string; label: string } => s !== null)
  }, [resultSelectedIndices, sessionResults, processedImages, excludedBlocksMap])

  const selectedPageBlockText = useMemo(() => {
    if (!selectedPageBlock || !currentResult) return null
    const cx = (b: TextBlock) => b.x + b.width / 2
    const cy = (b: TextBlock) => b.y + b.height / 2
    return currentResult.textBlocks
      .filter(b =>
        cx(b) >= selectedPageBlock.x && cx(b) <= selectedPageBlock.x + selectedPageBlock.width &&
        cy(b) >= selectedPageBlock.y && cy(b) <= selectedPageBlock.y + selectedPageBlock.height
      )
      .sort((a, b) => a.readingOrder - b.readingOrder)
      .map(b => b.text)
      .join('\n')
  }, [selectedPageBlock, currentResult])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    await processFiles(files)
  }, [processFiles])

  // Ctrl+V / Cmd+V でクリップボードの画像を貼り付け（アップロード画面表示中のみ）
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (sessionResults.length > 0 || isLoadingFiles || isProcessing) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) handleFilesSelected(files)
    }
    document.addEventListener('paste', handleGlobalPaste)
    return () => document.removeEventListener('paste', handleGlobalPaste)
  }, [sessionResults.length, isLoadingFiles, isProcessing, handleFilesSelected])

  // Cmd/Ctrl+A: Pending画面でサイドバー全選択（テキスト入力欄以外）
  useEffect(() => {
    if (processedImages.length <= 1) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setSelectedIndices(new Set(processedImages.map((_, i) => i)))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [processedImages])

  const handleSampleLoad = useCallback(async () => {
    const res = await fetch('/kumonoito.png')
    const blob = await res.blob()
    const file = new File([blob], 'kumonoito.png', { type: 'image/png' })
    await processFiles([file])
  }, [processFiles])

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const ext = type.split('/')[1] || 'png'
            files.push(new File([blob], `clipboard.${ext}`, { type }))
          }
        }
      }
      if (files.length > 0) await processFiles(files)
    } catch {
      // permission denied or no image in clipboard — ignore silently
    }
  }, [processFiles])

  // 「OCRを開始」が押されたら OCR 実行（全体 or 領域）
  useEffect(() => {
    if (!isReadyToProcess || processedImages.length === 0 || isProcessing) return

    const runOCR = async () => {
      setIsProcessing(true)

      // 文書言語に応じたOCRモデルが初期化済みか確認し、必要なら再初期化
      await ensureLanguage(getRecognitionLanguage(documentLanguage))

      // 領域選択がある場合 → その領域だけOCR
      if (selectedRegion) {
        const regionBbox = selectedRegion
        // 結果表示中の場合は現在の画像、pending中は pendingDataUrls を使う
        const srcDataUrl = currentResult
          ? currentResult.imageDataUrl
          : pendingDataUrls[pendingImageIndex] ?? ''
        const fileName = currentResult
          ? currentResult.fileName
          : processedImages[pendingImageIndex]?.fileName ?? 'region'

        try {
          const { previewDataUrl, imageData } = await cropRegion(srcDataUrl, regionBbox)
          const result = await processRegion(imageData)
          const regionResult: OCRResult = {
            id: `region-${Date.now()}`,
            fileName: `${fileName} (region)`,
            imageDataUrl: previewDataUrl,
            textBlocks: result.textBlocks,
            fullText: result.fullText,
            processingTimeMs: 0,
            createdAt: Date.now(),
          }
          setSessionResults((prev) => [...prev, regionResult])
          setSelectedResultIndex((prev) => prev + 1 > 0 ? sessionResults.length : 0)
        } catch (err) {
          console.error('Region OCR failed:', err)
        }

        setSelectedRegion(null)
        setIsProcessing(false)
        setIsReadyToProcess(false)
        return
      }

      // 全体OCR（選択がある場合は選択分のみ、なければ全件）
      const indicesToProcess = selectedIndices.size > 0
        ? [...selectedIndices].sort((a, b) => a - b)
        : processedImages.map((_, i) => i)

      setSessionResults([])
      setSelectedResultIndex(0)
      setSelectedIndices(new Set())
      resetState()

      const runId = crypto.randomUUID()
      const runCreatedAt = Date.now()
      const successItems: Array<{ result: OCRResult; thumbnailDataUrl: string }> = []
      const sessionResultsAccum: OCRResult[] = []
      cancelRef.current = false

      for (let idx = 0; idx < indicesToProcess.length; idx++) {
        if (cancelRef.current) break
        const i = indicesToProcess[idx]
        const image = processedImages[i]
        try {
          const result = await processImage(image, idx, indicesToProcess.length)
          successItems.push({ result, thumbnailDataUrl: image.thumbnailDataUrl })
          sessionResultsAccum.push(result)
          setSessionResults([...sessionResultsAccum])
          setSelectedResultIndex(sessionResultsAccum.length - 1)
        } catch (err) {
          console.error(`OCR failed for ${image.fileName}:`, err)
        }
      }
      cancelRef.current = false

      if (successItems.length > 0) {
        const runEntry: DBRunEntry = {
          id: runId,
          files: successItems.map(({ result, thumbnailDataUrl }) => ({
            fileName: result.fileName,
            imageDataUrl: thumbnailDataUrl,
            textBlocks: result.textBlocks,
            fullText: result.fullText,
            processingTimeMs: result.processingTimeMs,
          })),
          createdAt: runCreatedAt,
        }
        await saveRun(runEntry)
      }

      setIsProcessing(false)
      setIsReadyToProcess(false)
    }

    runOCR()
  }, [isReadyToProcess]) // eslint-disable-line react-hooks/exhaustive-deps

  // 数式認識ハンドラ（領域選択 → 数式として認識）
  const handleMathRecognize = useCallback(async () => {
    if (!selectedRegion || !modelConfig.mathEnabled) return
    const srcDataUrl = currentResult
      ? currentResult.imageDataUrl
      : pendingDataUrls[pendingImageIndex] ?? ''
    if (!srcDataUrl) return

    setIsMathProcessing(true)
    try {
      const { previewDataUrl, imageData } = await cropRegion(srcDataUrl, selectedRegion)
      // 動的importで数式認識モジュールをロード
      const { MathRecognizer } = await import('./worker/math-recognizer')
      const { loadModel } = await import('./worker/model-loader')

      const recognizer = new MathRecognizer()
      const [encoderData, decoderData] = await Promise.all([
        loadModel('mathEncoder', undefined, undefined),
        loadModel('mathDecoder', undefined, undefined),
      ])
      // tokenizer.json を取得
      const MODEL_BASE_URL = (import.meta.env.VITE_MODEL_BASE_URL as string | undefined) || '/models'
      const tokenizerRes = await fetch(`${MODEL_BASE_URL}/mfr-tokenizer.json`)
      const tokenizerJson = await tokenizerRes.text()

      await recognizer.initialize(encoderData, decoderData, tokenizerJson)
      const latex = await recognizer.recognize(imageData)
      recognizer.dispose()

      setMathResult({ latex, imageUrl: previewDataUrl })
    } catch (err) {
      console.error('Math recognition failed:', err)
      setMathResult({ latex: `Error: ${(err as Error).message}`, imageUrl: '' })
    } finally {
      setIsMathProcessing(false)
    }
  }, [selectedRegion, modelConfig.mathEnabled, currentResult, pendingDataUrls, pendingImageIndex])

  const handleStopProcessing = useCallback(() => {
    cancelRef.current = true
  }, [])

  const handleClear = () => {
    if (sessionResults.length > 0) {
      const msg = lang === 'ja'
        ? '現在のOCR結果は破棄されます。よろしいですか？'
        : 'Current OCR results will be discarded. Continue?'
      if (!window.confirm(msg)) return
    }
    clearImages()
    setSessionResults([])
    setSelectedResultIndex(0)
    setSelectedBlocks(new Set())
    setSelectedPageBlock(null)
    setSelectedRegion(null)
    setPreprocessedUrls({})
    resetState()
    setIsProcessing(false)
    setIsReadyToProcess(false)
    setPendingImageIndex(0)
  }

  // 領域選択ハンドラ（選択範囲を保持するだけ、即座にOCRしない）
  const handleRegionSelect = useCallback((bbox: BoundingBox) => {
    setSelectedRegion(bbox)
    setSelectedBlocks(new Set())
    setSelectedPageBlock(null)
  }, [])

  // 領域選択をクリア
  const handleClearRegion = useCallback(() => {
    setSelectedRegion(null)
  }, [])

  const handleHistorySelect = (run: DBRunEntry) => {
    const restoredResults: OCRResult[] = run.files.map((file, i) => ({
      id: `${run.id}-${i}`,
      fileName: file.fileName,
      imageDataUrl: file.imageDataUrl,
      textBlocks: file.textBlocks,
      fullText: file.fullText,
      processingTimeMs: file.processingTimeMs,
      createdAt: run.createdAt,
    }))
    setSessionResults(restoredResults)
    setSelectedResultIndex(0)
    setSelectedBlocks(new Set())
    setSelectedPageBlock(null)
    setSelectedRegion(null)
    setShowHistory(false)
  }

  const isModelLoading = jobState.status === 'loading_model'
  const isWorking = isLoadingFiles || isProcessing
  const hasResults = sessionResults.length > 0
  const hasPendingImages = processedImages.length > 0 && !isWorking && !hasResults

  // ページナビゲーション（結果表示時）
  const renderPageNav = (
    index: number,
    setIndex: (fn: (prev: number) => number) => void,
    total: number,
    maxIndex: number,
  ) => (
    <div className="result-page-nav">
      <button
        className="btn-nav"
        onClick={() => { setIndex((prev) => prev - 1); setSelectedBlocks(new Set()); setSelectedPageBlock(null); setSelectedRegion(null) }}
        disabled={index === 0}
        title={lang === 'ja' ? '前のファイル' : 'Previous file'}
      >←</button>
      <select
        className="result-page-select"
        value={index}
        onChange={(e) => {
          setIndex(() => Number(e.target.value))
          setSelectedBlocks(new Set())
          setSelectedPageBlock(null)
          setSelectedRegion(null)
        }}
      >
        {processedImages.map((img, i) => {
          const label = img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName
          return (
            <option key={i} value={i} disabled={i > maxIndex}>
              {i + 1} / {total}　{label}
            </option>
          )
        })}
      </select>
      <button
        className="btn-nav"
        onClick={() => { setIndex((prev) => prev + 1); setSelectedBlocks(new Set()); setSelectedPageBlock(null); setSelectedRegion(null) }}
        disabled={index >= maxIndex}
        title={lang === 'ja' ? '次のファイル' : 'Next file'}
      >→</button>
    </div>
  )

  return (
    <div className="app">
      {/* モバイル警告メッセージ（768px未満） */}
      <div className="mobile-warning">
        <p>
          {lang === 'ja'
            ? 'このアプリはPC環境（画面幅768px以上）での利用を推奨しています。スマートフォンでは画面が狭く、一部機能が正常に動作しない場合があります。'
            : 'This app is designed for desktop use (screen width 768px or wider). Some features may not work properly on smartphones.'}
        </p>
      </div>

      <Header
        lang={lang}
        onToggleLanguage={toggleLanguage}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHistory={() => setShowHistory(true)}
        onLogoClick={handleClear}
        aiConnectionStatus={aiConnectionStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main">
        {/* ===== アップロード画面 ===== */}
        {!hasResults && !isWorking && !isModelLoading && !hasPendingImages && (
          <section className="upload-section">
            <FileDropZone onFilesSelected={handleFilesSelected} lang={lang} disabled={isWorking} />
            <div className="upload-actions">
              <DirectoryPicker onFilesSelected={handleFilesSelected} lang={lang} disabled={isWorking} />
              <button className="btn btn-secondary" onClick={handlePasteFromClipboard} disabled={isWorking}>
                {lang === 'ja' ? 'クリップボードから貼り付け' : 'Paste from Clipboard'}
              </button>
              <button className="btn btn-secondary" onClick={handleSampleLoad} disabled={isWorking}>
                {lang === 'ja' ? 'サンプルを試す' : 'Try Sample'}
              </button>
            </div>
            <div className="upload-model-info">
              <span>
                {lang === 'ja' ? '文書の言語: ' : 'Document language: '}
                {DOCUMENT_LANGUAGE_OPTIONS.find(o => o.code === documentLanguage)?.label ?? documentLanguage}
              </span>
              {modelConfig.mathEnabled && (
                <span>{lang === 'ja' ? ' + 数式' : ' + Math'}</span>
              )}
            </div>
          </section>
        )}

        {/* ===== Pending 画面（認識前） ===== */}
        {hasPendingImages && (
          <section className="result-section">
            {processedImages.length > 1 && (
              <div className="result-sidebar">
                <div className="result-sidebar-list">
                  {processedImages.map((img, i) => (
                    <div key={i} className={`result-sidebar-item ${i === pendingImageIndex ? 'active' : ''} ${selectedIndices.has(i) ? 'selected' : ''}`}>
                      <button
                        className="result-sidebar-item-btn"
                        onClick={(e) => handleSidebarClick(i, e)}
                        title={img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName}
                      >
                        <img src={img.thumbnailDataUrl} alt={img.fileName} />
                        <span className="result-sidebar-label">
                          {img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName}
                        </span>
                      </button>
                      <button
                        className="sidebar-item-delete"
                        onClick={() => handleRemoveImage(i)}
                        title={lang === 'ja' ? '削除' : 'Delete'}
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="sidebar-toolbar">
                  <button onClick={() => addFileInputRef.current?.click()} title={lang === 'ja' ? '画像を追加' : 'Add images'}>＋</button>
                  <button onClick={handleClearAllImages} title={lang === 'ja' ? '全削除' : 'Delete all'}>🗑</button>
                </div>
                <input ref={addFileInputRef} type="file" accept="image/*,.pdf,.tiff,.tif,.heic,.heif" multiple hidden onChange={handleAddFiles} />
              </div>
            )}

            <div className="result-content">
              {processedImages.length > 1 &&
                renderPageNav(pendingImageIndex, setPendingImageIndex, processedImages.length, processedImages.length - 1)
              }

              <div className="pending-viewer">
                <div className="pending-viewer-buttons">
                  <select
                    className="select-doc-lang"
                    value={documentLanguage}
                    onChange={(e) => handleDocumentLanguageChange(e.target.value as DocumentLanguage)}
                    title={lang === 'ja' ? '文書の言語' : 'Document language'}
                  >
                    {DOCUMENT_LANGUAGE_OPTIONS.map(({ code, label }) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={() => setIsReadyToProcess(true)}>
                    {selectedRegion
                      ? (lang === 'ja' ? '選択領域のOCRを開始' : 'OCR Selected Region')
                      : selectedIndices.size > 0
                        ? (lang === 'ja' ? `選択した${selectedIndices.size}件のOCRを開始` : `OCR ${selectedIndices.size} Selected`)
                        : (lang === 'ja' ? 'OCRを開始' : 'Start OCR')}
                  </button>
                </div>
                <Suspense fallback={null}>
                  <ImagePreprocessPanel
                    lang={lang}
                    imageDataUrl={pendingDataUrls[pendingImageIndex] ?? ''}
                    onProcessed={(url) => handlePreprocessed(pendingImageIndex, url)}
                    onReset={() => handlePreprocessReset(pendingImageIndex)}
                    totalImages={processedImages.length}
                    onApplyAll={handlePreprocessAll}
                  />
                </Suspense>
                <ImageViewer
                  imageDataUrl={preprocessedUrls[pendingImageIndex] ?? pendingDataUrls[pendingImageIndex] ?? ''}
                  textBlocks={[]}
                  selectedBlocks={new Set()}
                  onBlockClick={() => {}}
                  onRegionSelect={handleRegionSelect}
                  selectedRegion={selectedRegion}
                />
                {selectedRegion && (
                  <div className="region-action-bar">
                    {modelConfig.mathEnabled && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleMathRecognize}
                        disabled={isMathProcessing}
                      >
                        {isMathProcessing
                          ? (lang === 'ja' ? '数式認識中...' : 'Recognizing...')
                          : (lang === 'ja' ? '数式として認識' : 'Recognize as Math')}
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={handleClearRegion}>
                      {lang === 'ja' ? '選択解除' : 'Clear Selection'}
                    </button>
                  </div>
                )}
                <p className="region-select-hint">
                  {lang === 'ja'
                    ? 'マウスで領域をドラッグして選択し、「OCRを開始」で認識できます'
                    : 'Drag to select a region, then click "Start OCR" to recognize'}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ===== ローディング画面 ===== */}
        {(isLoadingFiles || isModelLoading) && (
          <div className="processing-section">
            {isLoadingFiles && fileLoadingState && (
              <div className="file-loading-status">
                <div className="file-loading-spinner" />
                <span className="file-loading-message">
                  {fileLoadingState.currentPage != null && fileLoadingState.totalPages != null
                    ? lang === 'ja'
                      ? `${fileLoadingState.fileName} をレンダリング中... (${fileLoadingState.currentPage} / ${fileLoadingState.totalPages} ページ)`
                      : `Rendering ${fileLoadingState.fileName}... (page ${fileLoadingState.currentPage} / ${fileLoadingState.totalPages})`
                    : lang === 'ja'
                      ? `${fileLoadingState.fileName} を読み込み中...`
                      : `Loading ${fileLoadingState.fileName}...`}
                </span>
              </div>
            )}
            <ProgressBar jobState={jobState} lang={lang} />
            {!isReady && !isModelLoading && (
              <p className="model-loading-note">
                {lang === 'ja'
                  ? '初回起動時はモデルのダウンロードに時間がかかります（数分程度）。次回以降はキャッシュから高速起動します。'
                  : 'First run requires model download (may take a few minutes). Subsequent runs will use the cached model.'}
              </p>
            )}
          </div>
        )}

        {/* ===== 結果表示（SplitView） ===== */}
        {(hasResults || isProcessing) && processedImages.length > 0 && (
          <section className="result-section result-section-split">
            {/* 左サイドバー: 全ファイル一覧 */}
            {processedImages.length > 1 && (
              <div className="result-sidebar">
                <div className="result-sidebar-list">
                  {processedImages.map((img, i) => {
                    const result = sessionResults[i]
                    const isInProgress = !result && isProcessing && i === sessionResults.length
                    const isPending = !result && !isInProgress
                    return (
                      <div key={i} className={`result-sidebar-item ${result && i === selectedResultIndex ? 'active' : ''} ${resultSelectedIndices.has(i) ? 'selected' : ''} ${isPending || isInProgress ? 'sidebar-pending' : ''}`}>
                        <button
                          className="result-sidebar-item-btn"
                          onClick={(e) => { if (result) handleResultSidebarClick(i, e) }}
                          disabled={!result}
                          title={img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName}
                        >
                          <div className="result-sidebar-thumb-wrap">
                            <img src={result ? result.imageDataUrl : img.thumbnailDataUrl} alt={img.fileName} />
                            {isInProgress && <div className="sidebar-item-spinner" />}
                          </div>
                          <span className="result-sidebar-label">
                            {img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName}
                          </span>
                        </button>
                        <button
                          className="sidebar-item-delete"
                          onClick={() => handleRemoveImage(i)}
                          title={lang === 'ja' ? '削除' : 'Delete'}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
                <div className="sidebar-toolbar">
                  <button onClick={() => addFileInputRef.current?.click()} title={lang === 'ja' ? '画像を追加' : 'Add images'}>＋</button>
                  <button onClick={handleClearAllImages} title={lang === 'ja' ? '全削除' : 'Delete all'}>🗑</button>
                </div>
                <input ref={addFileInputRef} type="file" accept="image/*,.pdf,.tiff,.tif,.heic,.heif" multiple hidden onChange={handleAddFiles} />
              </div>
            )}

            {/* メインコンテンツ: SplitView */}
            <div className="result-content">
              {/* 処理中プログレス */}
              {isProcessing && (
                <div className="result-progress-inline">
                  <ProgressBar jobState={jobState} lang={lang} />
                  <button className="btn btn-secondary btn-sm btn-stop" onClick={handleStopProcessing}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </svg>
                    {lang === 'ja' ? '停止' : 'Stop'}
                  </button>
                </div>
              )}

              {/* ページナビ + 新規処理ボタン */}
              <div className="result-toolbar">
                {renderPageNav(selectedResultIndex, setSelectedResultIndex, processedImages.length, sessionResults.length - 1)}
                {!isProcessing && (
                  <button className="btn btn-secondary btn-new-file" onClick={handleClear}>
                    {lang === 'ja' ? '新しいファイルを処理' : 'Process New Files'}
                  </button>
                )}
              </div>

              {/* 左右分割ビュー */}
              <SplitView
                left={
                  <div className="split-image-panel">
                    {currentResult && (
                      <>
                        <Suspense fallback={null}>
                          <ImagePreprocessPanel
                            lang={lang}
                            imageDataUrl={currentResult.imageDataUrl}
                            onProcessed={(url) => handlePreprocessed(selectedResultIndex + 10000, url)}
                            onReset={() => handlePreprocessReset(selectedResultIndex + 10000)}
                          />
                        </Suspense>
                        <ImageViewer
                          imageDataUrl={preprocessedUrls[selectedResultIndex + 10000] ?? currentResult.imageDataUrl}
                          textBlocks={currentResult.textBlocks}
                          selectedBlocks={selectedBlocks}
                          excludedBlocks={currentExcludedBlocks}
                          onBlockClick={handleBlockClick}
                          onRegionSelect={handleRegionSelect}
                          selectedRegion={selectedRegion}
                          pageBlocks={currentResult.pageBlocks}
                          selectedPageBlock={selectedPageBlock}
                          onPageBlockSelect={(block) => { setSelectedPageBlock(block); setSelectedBlocks(new Set()) }}
                          pageIndex={selectedResultIndex}
                          totalPages={processedImages.length}
                        />
                        {selectedRegion && (
                          <div className="region-action-bar">
                            <button className="btn btn-primary btn-sm" onClick={() => setIsReadyToProcess(true)}>
                              {lang === 'ja' ? '選択領域のOCRを開始' : 'OCR Selected Region'}
                            </button>
                            {modelConfig.mathEnabled && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleMathRecognize}
                                disabled={isMathProcessing}
                              >
                                {isMathProcessing
                                  ? (lang === 'ja' ? '数式認識中...' : 'Recognizing...')
                                  : (lang === 'ja' ? '数式として認識' : 'Recognize as Math')}
                              </button>
                            )}
                            <button className="btn btn-secondary btn-sm" onClick={handleClearRegion}>
                              {lang === 'ja' ? '選択解除' : 'Clear Selection'}
                            </button>
                          </div>
                        )}
                        <p className="region-select-hint">
                          {lang === 'ja'
                            ? 'マウスで領域をドラッグして選択し、「選択領域のOCRを開始」で再認識できます'
                            : 'Drag to select a region, then click "OCR Selected Region" to re-recognize'}
                        </p>
                      </>
                    )}
                  </div>
                }
                right={
                  <TextEditor
                    result={editorResult}
                    selectedBlocksInfo={selectedBlocksInfo}
                    onExcludeBlocks={handleExcludeBlocks}
                    onRestoreBlocks={handleRestoreBlocks}
                    excludedCount={currentExcludedBlocks.size}
                    onRestoreAllBlocks={handleRestoreAllBlocks}
                    selectedPageBlockText={isMergedMode ? null : selectedPageBlockText}
                    lang={lang}
                    aiConnector={getConnector(buildProofreadPrompt(aiSettings.customPrompt, DOCUMENT_LANGUAGE_NAMES[documentLanguage]))}
                    aiConnectionStatus={aiConnectionStatus}
                    imageDataUrl={currentResult?.imageDataUrl}
                    onBatchTextExport={handleBatchTextExport}
                    hasBatchResults={sessionResults.length > 1}
                    isMergedMode={isMergedMode}
                    mergedCount={resultSelectedIndices.size}
                    onMergedEditChange={setMergedEditDirty}
                    mergedSections={mergedSections}
                  />
                }
              />
            </div>
          </section>
        )}
      </main>

      <BottomToolbar
        lang={lang}
        onUpload={handleClear}
        ocrTimeMs={currentResult?.processingTimeMs}
        hasResults={hasResults}
      />

      <Footer lang={lang} />

      {showHistory && (
        <Suspense fallback={null}>
          <HistoryPanel
            runs={historyRuns}
            onSelect={handleHistorySelect}
            onClear={clearResults}
            onClose={() => setShowHistory(false)}
            lang={lang}
          />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal
            onClose={() => setShowSettings(false)}
            lang={lang}
            aiSettings={aiSettings}
            onUpdateAISettings={updateAISettings}
            onSwitchProvider={switchProvider}
            connectionStatus={aiConnectionStatus}
            onTestConnection={testAndConnect}
            modelConfig={modelConfig}
            onUpdateModelConfig={setModelConfig}
          />
        </Suspense>
      )}
      {/* 数式認識結果ダイアログ — MathJax typeset */}
      {mathResult && (() => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        // MathJax re-typeset when result changes
        setTimeout(() => {
          const w = window as unknown as { MathJax?: { typeset?: (elems?: HTMLElement[]) => void } }
          const el = document.getElementById('math-result-rendered')
          if (w.MathJax?.typeset && el) w.MathJax.typeset([el])
        }, 100)
        return null
      })()}
      {mathResult && (
        <div className="panel-overlay" onClick={() => setMathResult(null)}>
          <div className="panel math-result-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2>{lang === 'ja' ? '数式認識結果' : 'Math Recognition Result'}</h2>
              <button className="btn-close" onClick={() => setMathResult(null)}>✕</button>
            </div>
            <div className="panel-body">
              {mathResult.imageUrl && (
                <div className="math-result-image">
                  <img src={mathResult.imageUrl} alt="Math region" style={{ maxWidth: '100%', maxHeight: '200px' }} />
                </div>
              )}
              <div className="math-result-latex">
                <label>{lang === 'ja' ? 'LaTeX:' : 'LaTeX:'}</label>
                <textarea
                  className="math-result-textarea"
                  value={mathResult.latex}
                  readOnly
                  rows={3}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(mathResult.latex) } catch { /* ignore */ }
                  }}
                >
                  {lang === 'ja' ? 'コピー' : 'Copy'}
                </button>
              </div>
              <div className="math-result-rendered" id="math-result-rendered">
                <label>{lang === 'ja' ? 'プレビュー:' : 'Preview:'}</label>
                <div className="math-result-preview">{`$$${mathResult.latex}$$`}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
