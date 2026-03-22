import { useState, useEffect, useCallback, useMemo } from 'react'
import type { OCRResult, TextBlock, BoundingBox, PageBlock } from './types/ocr'
import type { DBRunEntry } from './types/db'
import { useI18n } from './hooks/useI18n'
import { useOCRWorker } from './hooks/useOCRWorker'
import { useFileProcessor } from './hooks/useFileProcessor'
import { useResultCache } from './hooks/useResultCache'
import { useAISettings } from './hooks/useAISettings'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { SplitView } from './components/layout/SplitView'
import { BottomToolbar } from './components/layout/BottomToolbar'
import { FileDropZone } from './components/upload/FileDropZone'
import { DirectoryPicker } from './components/upload/DirectoryPicker'
import { ProgressBar } from './components/progress/ProgressBar'
import { ImageViewer } from './components/viewer/ImageViewer'
import { TextEditor } from './components/editor/TextEditor'
import { HistoryPanel } from './components/results/HistoryPanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { RegionOCRDialog } from './components/viewer/RegionOCRDialog'
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
  const { isReady, jobState, processImage, processRegion, resetState } = useOCRWorker()
  const { processedImages, isLoading: isLoadingFiles, processFiles, clearImages, fileLoadingState } = useFileProcessor()
  const { runs: historyRuns, saveRun, clearResults } = useResultCache()
  const {
    settings: aiSettings,
    updateSettings: updateAISettings,
    switchProvider,
    connectionStatus: aiConnectionStatus,
    testAndConnect,
    getConnector,
  } = useAISettings()

  const [sessionResults, setSessionResults] = useState<OCRResult[]>([])
  const [selectedResultIndex, setSelectedResultIndex] = useState(0)
  const [selectedBlock, setSelectedBlock] = useState<TextBlock | null>(null)
  const [selectedPageBlock, setSelectedPageBlock] = useState<PageBlock | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isReadyToProcess, setIsReadyToProcess] = useState(false)
  const [pendingImageIndex, setPendingImageIndex] = useState(0)

  // pending 状態での ImageViewer 表示用（全解像度 DataUrl）
  const pendingDataUrls = useMemo(
    () => processedImages.map((img) => imageDataToDataUrl(img.imageData)),
    [processedImages]
  )

  // processedImages が差し替わったらインデックスをリセット
  useEffect(() => { setPendingImageIndex(0) }, [processedImages])
  const [regionOCRDialog, setRegionOCRDialog] = useState<{
    cropDataUrl: string
    isProcessing: boolean
    result: { textBlocks: TextBlock[]; fullText: string } | null
  } | null>(null)

  const currentResult = sessionResults[selectedResultIndex] ?? null

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

  // 「認識を開始」が押されたら OCR 実行
  useEffect(() => {
    if (!isReadyToProcess || processedImages.length === 0 || isProcessing) return

    const runOCR = async () => {
      setIsProcessing(true)
      setSessionResults([])
      setSelectedResultIndex(0)
      resetState()

      const runId = crypto.randomUUID()
      const runCreatedAt = Date.now()
      const successItems: Array<{ result: OCRResult; thumbnailDataUrl: string }> = []
      const sessionResultsAccum: OCRResult[] = []

      for (let i = 0; i < processedImages.length; i++) {
        const image = processedImages[i]
        try {
          const result = await processImage(image, i, processedImages.length)
          successItems.push({ result, thumbnailDataUrl: image.thumbnailDataUrl })
          sessionResultsAccum.push(result)
          setSessionResults([...sessionResultsAccum])
          setSelectedResultIndex(sessionResultsAccum.length - 1)
        } catch (err) {
          console.error(`OCR failed for ${image.fileName}:`, err)
        }
      }

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

  const handleClear = () => {
    clearImages()
    setSessionResults([])
    setSelectedResultIndex(0)
    setSelectedBlock(null)
    setSelectedPageBlock(null)
    resetState()
    setIsProcessing(false)
    setIsReadyToProcess(false)
    setPendingImageIndex(0)
  }

  // 領域 OCR の共通ハンドラ（pending・result 両方から呼ぶ）
  const handleRegionOCR = useCallback(async (blocks: TextBlock[], bbox: BoundingBox, srcDataUrl: string) => {
    if (blocks.length > 0) setSelectedBlock(blocks[0])
    const { previewDataUrl, imageData } = await cropRegion(srcDataUrl, bbox)
    setRegionOCRDialog({ cropDataUrl: previewDataUrl, isProcessing: true, result: null })
    try {
      const result = await processRegion(imageData)
      setRegionOCRDialog(prev => prev ? { ...prev, isProcessing: false, result } : null)
    } catch {
      setRegionOCRDialog(prev => prev ? { ...prev, isProcessing: false, result: { textBlocks: [], fullText: '' } } : null)
    }
  }, [processRegion])

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
    setSelectedBlock(null)
    setSelectedPageBlock(null)
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
        onClick={() => { setIndex((prev) => prev - 1); setSelectedBlock(null); setSelectedPageBlock(null) }}
        disabled={index === 0}
        title={lang === 'ja' ? '前のファイル' : 'Previous file'}
      >←</button>
      <select
        className="result-page-select"
        value={index}
        onChange={(e) => {
          setIndex(() => Number(e.target.value))
          setSelectedBlock(null)
          setSelectedPageBlock(null)
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
        onClick={() => { setIndex((prev) => prev + 1); setSelectedBlock(null); setSelectedPageBlock(null) }}
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
          </section>
        )}

        {/* ===== Pending 画面（認識前） ===== */}
        {hasPendingImages && (
          <section className="result-section">
            {processedImages.length > 1 && (
              <div className="result-sidebar">
                {processedImages.map((img, i) => (
                  <button
                    key={i}
                    className={`result-sidebar-item ${i === pendingImageIndex ? 'active' : ''}`}
                    onClick={() => setPendingImageIndex(i)}
                    title={img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName}
                  >
                    <img src={img.thumbnailDataUrl} alt={img.fileName} />
                    <span className="result-sidebar-label">
                      {img.pageIndex ? `${img.fileName} (p.${img.pageIndex})` : img.fileName}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="result-content">
              {processedImages.length > 1 &&
                renderPageNav(pendingImageIndex, setPendingImageIndex, processedImages.length, processedImages.length - 1)
              }

              <div className="pending-viewer">
                <button className="btn btn-primary btn-above-viewer" onClick={() => setIsReadyToProcess(true)}>
                  {lang === 'ja' ? 'OCRを開始' : 'Start OCR'}
                </button>
                <ImageViewer
                  imageDataUrl={pendingDataUrls[pendingImageIndex] ?? ''}
                  textBlocks={[]}
                  selectedBlock={null}
                  onBlockSelect={() => {}}
                  onRegionSelect={(blocks, bbox) =>
                    handleRegionOCR(blocks, bbox, pendingDataUrls[pendingImageIndex] ?? '')
                  }
                />
                <p className="region-select-hint">
                  {lang === 'ja'
                    ? 'マウスで領域をドラッグすると、その領域のみ認識をおこないます'
                    : 'Drag to select a region and run OCR on that area only'}
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
                {processedImages.map((img, i) => {
                  const result = sessionResults[i]
                  const isInProgress = !result && isProcessing && i === sessionResults.length
                  const isPending = !result && !isInProgress
                  return (
                    <button
                      key={i}
                      className={`result-sidebar-item ${result && i === selectedResultIndex ? 'active' : ''} ${isPending || isInProgress ? 'sidebar-pending' : ''}`}
                      onClick={() => { if (result) { setSelectedResultIndex(i); setSelectedBlock(null) } }}
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
                  )
                })}
              </div>
            )}

            {/* メインコンテンツ: SplitView */}
            <div className="result-content">
              {/* 処理中プログレス */}
              {isProcessing && (
                <div className="result-progress-inline">
                  <ProgressBar jobState={jobState} lang={lang} />
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
                      <ImageViewer
                        imageDataUrl={currentResult.imageDataUrl}
                        textBlocks={currentResult.textBlocks}
                        selectedBlock={selectedBlock}
                        onBlockSelect={(block) => { setSelectedBlock(block); setSelectedPageBlock(null) }}
                        onRegionSelect={(blocks, bbox) =>
                          currentResult
                            ? handleRegionOCR(blocks, bbox, currentResult.imageDataUrl)
                            : undefined
                        }
                        pageBlocks={currentResult.pageBlocks}
                        selectedPageBlock={selectedPageBlock}
                        onPageBlockSelect={(block) => { setSelectedPageBlock(block); setSelectedBlock(null) }}
                        pageIndex={selectedResultIndex}
                        totalPages={processedImages.length}
                      />
                    )}
                    <p className="region-select-hint">
                      {lang === 'ja'
                        ? 'マウスで領域をドラッグすると、その領域のみ認識をおこないます（Alt+ドラッグでパン、ホイールでズーム）'
                        : 'Drag to select a region for OCR (Alt+drag to pan, scroll to zoom)'}
                    </p>
                  </div>
                }
                right={
                  <TextEditor
                    result={currentResult}
                    results={sessionResults}
                    selectedBlock={selectedBlock}
                    selectedPageBlockText={selectedPageBlockText}
                    lang={lang}
                    aiConnector={getConnector()}
                    imageDataUrl={currentResult?.imageDataUrl}
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
        <HistoryPanel
          runs={historyRuns}
          onSelect={handleHistorySelect}
          onClear={clearResults}
          onClose={() => setShowHistory(false)}
          lang={lang}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          lang={lang}
          aiSettings={aiSettings}
          onUpdateAISettings={updateAISettings}
          onSwitchProvider={switchProvider}
          connectionStatus={aiConnectionStatus}
          onTestConnection={testAndConnect}
        />
      )}
      {regionOCRDialog && (
        <RegionOCRDialog
          cropDataUrl={regionOCRDialog.cropDataUrl}
          isProcessing={regionOCRDialog.isProcessing}
          result={regionOCRDialog.result}
          lang={lang}
          onClose={() => setRegionOCRDialog(null)}
        />
      )}
    </div>
  )
}
