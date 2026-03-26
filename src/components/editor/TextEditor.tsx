import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { OCRResult } from '../../types/ocr'
import type { AIConnector } from '../../types/ai'
import type { AIConnectionStatus } from '../../hooks/useAISettings'
import { downloadText, copyToClipboard } from '../../utils/textExport'
import { DiffView } from './DiffView'
import type { Language } from '../../i18n'

interface TextEditorProps {
  result: OCRResult | null
  selectedBlocksInfo?: { count: number; text: string; hasExcluded: boolean; hasNonExcluded: boolean } | null
  onExcludeBlocks?: () => void
  onRestoreBlocks?: () => void
  selectedPageBlockText: string | null
  lang: Language
  onTextChange?: (text: string) => void
  aiConnector: AIConnector | null
  aiConnectionStatus?: AIConnectionStatus
  imageDataUrl?: string
  onBatchTextExport?: () => void
  hasBatchResults?: boolean
  isMergedMode?: boolean
  mergedCount?: number
  onMergedEditChange?: (dirty: boolean) => void
  mergedSections?: Array<{ imageDataUrl: string; text: string; label: string; excludedRects?: Array<{ x: number; y: number; width: number; height: number }> }>
  excludedCount?: number
  onRestoreAllBlocks?: () => void
  excludedRects?: Array<{ x: number; y: number; width: number; height: number }>
}

type ProofreadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; originalText: string; correctedText: string }
  | { status: 'error'; message: string }

interface SearchMatch {
  start: number
  end: number
}

export function TextEditor({
  result,
  selectedBlocksInfo,
  onExcludeBlocks,
  onRestoreBlocks,
  selectedPageBlockText,
  lang,
  onTextChange,
  aiConnector,
  aiConnectionStatus = 'disconnected',
  imageDataUrl,
  onBatchTextExport,
  hasBatchResults,
  isMergedMode,
  mergedCount,
  onMergedEditChange,
  mergedSections,
  excludedCount,
  onRestoreAllBlocks,
  excludedRects,
}: TextEditorProps) {
  const [editedText, setEditedText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [includeFileName, setIncludeFileName] = useState(false)
  const [ignoreNewlines, setIgnoreNewlines] = useState(false)
  const [proofreadState, setProofreadState] = useState<ProofreadState>({ status: 'idle' })
  const [fontSize, setFontSize] = useState(14)
  const [showLineNumbers, setShowLineNumbers] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [isVertical, setIsVertical] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  // Undo/Redo stacks
  interface UndoRedoEntry { text: string; cursorPos?: number }
  const [undoStack, setUndoStack] = useState<UndoRedoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoRedoEntry[]>([])
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingUndoRef = useRef<string | null>(null)

  // editedText が null なら result.fullText を使う
  const displayText = editedText ?? result?.fullText ?? ''

  // Determine if we should show diff view
  const shouldShowDiff = proofreadState.status === 'done'

  // Search matches calculation
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!searchQuery || shouldShowDiff) return []
    const query = searchQuery
    const matches: SearchMatch[] = []
    let index = 0
    const text = displayText
    while ((index = text.indexOf(query, index)) !== -1) {
      matches.push({ start: index, end: index + query.length })
      index += 1
    }
    return matches
  }, [searchQuery, displayText, shouldShowDiff])

  // Line numbers
  const lineCount = useMemo(() => {
    return displayText.split('\n').length
  }, [displayText])

  const flushUndo = useCallback(() => {
    if (pendingUndoRef.current !== null) {
      const text = pendingUndoRef.current
      setUndoStack(prev => [...prev, { text, cursorPos: textareaRef.current?.selectionStart }])
      pendingUndoRef.current = null
    }
  }, [])

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      // Record undo snapshot (debounced: first keystroke of a burst captures current text)
      if (pendingUndoRef.current === null) {
        pendingUndoRef.current = displayText
      }
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(flushUndo, 500)
      setRedoStack([])
      setEditedText(newText)
      onTextChange?.(newText)
      if (isMergedMode) onMergedEditChange?.(true)
    },
    [onTextChange, displayText, flushUndo, isMergedMode, onMergedEditChange],
  )

  const handleUndo = useCallback(() => {
    flushUndo()
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      setRedoStack(r => [...r, { text: displayText, cursorPos: textareaRef.current?.selectionStart }])
      setEditedText(entry.text)
      onTextChange?.(entry.text)
      if (entry.cursorPos !== undefined) {
        setTimeout(() => {
          textareaRef.current?.setSelectionRange(entry.cursorPos!, entry.cursorPos!)
        })
      }
      return prev.slice(0, -1)
    })
  }, [flushUndo, displayText, onTextChange])

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const entry = prev[prev.length - 1]
      setUndoStack(u => [...u, { text: displayText, cursorPos: textareaRef.current?.selectionStart }])
      setEditedText(entry.text)
      onTextChange?.(entry.text)
      if (entry.cursorPos !== undefined) {
        setTimeout(() => {
          textareaRef.current?.setSelectionRange(entry.cursorPos!, entry.cursorPos!)
        })
      }
      return prev.slice(0, -1)
    })
  }, [displayText, onTextChange])

  // Scroll sync for line numbers
  const handleTextareaScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      if (isVertical) {
        gutterRef.current.scrollLeft = textareaRef.current.scrollLeft
      } else {
        gutterRef.current.scrollTop = textareaRef.current.scrollTop
      }
    }
  }, [isVertical])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.key === 'f') {
        e.preventDefault()
        setShowSearchBar(!showSearchBar)
      } else if (e.key === 'Escape' && showSearchBar) {
        setShowSearchBar(false)
      } else if (isMeta && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleRedo()
      } else if (isMeta && e.key === 'z') {
        // Only handle undo if textarea is focused
        if (document.activeElement === textareaRef.current) {
          e.preventDefault()
          handleUndo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSearchBar, handleUndo, handleRedo])

  // result が変わったら編集状態・校正状態をリセット
  const [prevResultId, setPrevResultId] = useState<string | null>(null)
  if (result && result.id !== prevResultId) {
    setPrevResultId(result.id)
    setEditedText(null)
    setProofreadState({ status: 'idle' })
    setUndoStack([])
    setRedoStack([])
  }

  const applyOptions = (text: string) =>
    ignoreNewlines ? text.replace(/\n/g, '') : text

  const handleCopy = async () => {
    const text = applyOptions(displayText)
    try {
      await copyToClipboard(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownload = () => {
    if (!result) return
    const text = applyOptions(editedText ?? result.fullText)
    downloadText(
      includeFileName ? `=== ${result.fileName} ===\n${text}` : text,
      result.fileName,
    )
  }

  // 改行削除（段落区切りのみ保持）
  const handleRemoveLineBreaks = useCallback(() => {
    if (!result) return
    const blocks = result.textBlocks
      .slice()
      .sort((a, b) => a.readingOrder - b.readingOrder)
    if (blocks.length === 0) return

    // undo用にスナップショットを保存
    if (pendingUndoRef.current === null) {
      pendingUndoRef.current = displayText
    }
    flushUndo()

    const lines = displayText.split('\n')
    // ブロック間の間隔から段落区切りを判定
    const paragraphBreaks = new Set<number>()
    for (let i = 0; i < blocks.length - 1; i++) {
      const current = blocks[i]
      const next = blocks[i + 1]
      const gap = next.y - (current.y + current.height)
      const avgHeight = (current.height + next.height) / 2
      if (gap > avgHeight * 0.5) {
        paragraphBreaks.add(i)
      }
    }
    // 最終行の後も段落区切り
    paragraphBreaks.add(blocks.length - 1)

    // 行を結合（段落区切り以外の改行を削除）
    const parts: string[] = []
    let currentParagraph = ''
    for (let i = 0; i < lines.length; i++) {
      currentParagraph += lines[i]
      if (paragraphBreaks.has(i)) {
        parts.push(currentParagraph)
        currentParagraph = ''
      }
    }
    if (currentParagraph) parts.push(currentParagraph)

    const newText = parts.join('\n')
    setEditedText(newText)
    setRedoStack([])
    onTextChange?.(newText)
  }, [result, displayText, flushUndo, onTextChange])

  // 除外ブロック領域を白で塗りつぶした画像を生成
  const maskExcludedRegions = useCallback((dataUrl: string, rects: Array<{ x: number; y: number; width: number; height: number }>): Promise<string> => {
    return new Promise((resolve) => {
      if (rects.length === 0) { resolve(dataUrl); return }
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        ctx.fillStyle = '#ffffff'
        for (const r of rects) {
          ctx.fillRect(r.x, r.y, r.width, r.height)
        }
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  }, [])

  // AI校正実行
  const handleProofread = useCallback(async () => {
    if (!aiConnector || !result) return

    // AI未接続（接続テスト未実施）の場合、警告を表示
    if (aiConnectionStatus !== 'connected') {
      const msg = lang === 'ja'
        ? 'AI接続が確認されていません。設定画面で接続テストを実行してください。続行しますか？'
        : 'AI connection has not been verified. Please run a connection test in Settings. Continue anyway?'
      if (!window.confirm(msg)) return
    }

    const textToProofread = editedText ?? result.fullText
    setProofreadState({ status: 'loading' })
    try {
      let correctedText: string

      const rects = excludedRects ?? []

      if (isMergedMode && mergedSections && mergedSections.length > 0) {
        // 結合モード: 各セクションを並列にAI校正し、リーダー線で再結合
        const maskedSections = await Promise.all(
          mergedSections.map(async section => ({
            ...section,
            imageDataUrl: await maskExcludedRegions(section.imageDataUrl, section.excludedRects ?? []),
          }))
        )
        const results = await Promise.all(
          maskedSections.map(section =>
            aiConnector.proofread(section.text, section.imageDataUrl)
          )
        )
        correctedText = results
          .map((r, i) => {
            const label = mergedSections[i].label
            const line = `──────────── ${label} ────────────`
            return line + '\n' + r.correctedText
          })
          .join('\n\n')
      } else {
        // 単一モード: 除外ブロック領域を塗りつぶした画像を使用
        const maskedImage = await maskExcludedRegions(imageDataUrl ?? '', rects)
        const proofResult = await aiConnector.proofread(textToProofread, maskedImage)
        correctedText = proofResult.correctedText
      }

      setProofreadState({
        status: 'done',
        originalText: textToProofread,
        correctedText,
      })
    } catch (err) {
      setProofreadState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [aiConnector, aiConnectionStatus, lang, result, editedText, imageDataUrl, isMergedMode, mergedSections, excludedRects, maskExcludedRegions])

  // 校正結果を全て適用
  const handleAcceptAll = useCallback(() => {
    if (proofreadState.status !== 'done') return
    setEditedText(proofreadState.correctedText)
    onTextChange?.(proofreadState.correctedText)
    setProofreadState({ status: 'idle' })
  }, [proofreadState, onTextChange])

  // 校正結果を全て却下
  const handleRejectAll = useCallback(() => {
    setProofreadState({ status: 'idle' })
  }, [])

  // Search and Replace handlers
  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length)
  }, [searchMatches])

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length)
  }, [searchMatches])

  const handleReplace = useCallback(() => {
    if (searchMatches.length === 0 || !textareaRef.current) return
    const match = searchMatches[currentMatchIndex]
    const before = displayText.slice(0, match.start)
    const after = displayText.slice(match.end)
    const newText = before + replaceQuery + after
    setEditedText(newText)
    onTextChange?.(newText)
  }, [searchMatches, currentMatchIndex, displayText, replaceQuery, onTextChange])

  const handleReplaceAll = useCallback(() => {
    if (searchMatches.length === 0) return
    let newText = displayText
    const offset = replaceQuery.length - searchQuery.length
    searchMatches.forEach((match, idx) => {
      const adjustedStart = match.start + offset * idx
      const adjustedEnd = adjustedStart + searchQuery.length
      newText = newText.slice(0, adjustedStart) + replaceQuery + newText.slice(adjustedEnd)
    })
    setEditedText(newText)
    onTextChange?.(newText)
    setCurrentMatchIndex(0)
  }, [searchMatches, displayText, searchQuery, replaceQuery, onTextChange])

  if (!result) {
    return (
      <div className="text-editor empty">
        <p>{lang === 'ja' ? '結果なし' : 'No results'}</p>
      </div>
    )
  }

  return (
    <div className="text-editor">
      {/* ヘッダー: タイトル + ボタン群（AI校正 / Copy / DL） */}
      <div className="text-editor-header">
        <div className="text-editor-header-left">
          <span className="text-editor-label">OCR result</span>
          {isMergedMode ? (
            <span className="text-editor-merged-badge">
              {lang === 'ja' ? `${mergedCount}件を結合表示中` : `${mergedCount} pages merged`}
            </span>
          ) : (
            <span className="text-editor-stats">
              {result.textBlocks.length}
              {lang === 'ja' ? ' 領域' : ' regions'}
              {' · '}
              {(result.processingTimeMs / 1000).toFixed(1)}s
            </span>
          )}
          {excludedCount != null && excludedCount > 0 && onRestoreAllBlocks && (
            <span className="text-editor-excluded-badge">
              {lang === 'ja' ? `${excludedCount}件除外中` : `${excludedCount} excluded`}
              <button className="text-editor-restore-btn" onClick={onRestoreAllBlocks}>
                {lang === 'ja' ? '全て復活' : 'Restore all'}
              </button>
            </span>
          )}
        </div>
        <div className="text-editor-header-buttons">
          <button
            className="btn btn-icon btn-sm"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title={lang === 'ja' ? '元に戻す (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
            aria-label="Undo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M3 13a9 9 0 0 1 3-7.7A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
            </svg>
          </button>
          <button
            className="btn btn-icon btn-sm"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title={lang === 'ja' ? 'やり直す (Ctrl+Shift+Z)' : 'Redo (Ctrl+Shift+Z)'}
            aria-label="Redo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" /><path d="M21 13a9 9 0 0 0-3-7.7A9 9 0 0 0 3 12a9 9 0 0 0 9 9 9 9 0 0 0 6.7-3" />
            </svg>
          </button>
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setShowSearchBar(!showSearchBar)}
            title={lang === 'ja' ? '検索と置換' : 'Find and Replace'}
            aria-label="Search"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="6" cy="6" r="4" />
              <path d="m10 10 4 4" />
            </svg>
          </button>
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title={lang === 'ja' ? '行番号' : 'Line numbers'}
            aria-label="Toggle line numbers"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <text x="2" y="6" fontSize="8" fill="currentColor">1</text>
              <text x="2" y="12" fontSize="8" fill="currentColor">2</text>
            </svg>
          </button>
          <button
            className={`btn btn-icon btn-sm${isVertical ? ' btn-icon-active' : ''}`}
            onClick={() => setIsVertical(!isVertical)}
            title={lang === 'ja' ? (isVertical ? '横書きに切替' : '縦書きに切替') : (isVertical ? 'Switch to horizontal' : 'Switch to vertical')}
            aria-label="Toggle vertical text"
            aria-pressed={isVertical}
          >
            {isVertical ? (
              /* Vertical text icon: 縦 */
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="11" y1="2" x2="11" y2="14" />
                <line x1="8" y1="2" x2="8" y2="14" />
                <line x1="5" y1="2" x2="5" y2="14" />
                <polyline points="13 4 11 2 9 4" fill="none" />
              </svg>
            ) : (
              /* Horizontal text icon: 横 */
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="5" x2="14" y2="5" />
                <line x1="2" y1="8" x2="14" y2="8" />
                <line x1="2" y1="11" x2="14" y2="11" />
                <polyline points="12 3 14 5 12 7" fill="none" />
              </svg>
            )}
          </button>
          <button
            className="btn btn-ai"
            onClick={handleProofread}
            disabled={!aiConnector || proofreadState.status === 'loading' || (result.textBlocks.length === 0 && !result.fullText)}
            title={!aiConnector ? (lang === 'ja' ? '設定でAI接続を構成してください' : 'Configure AI connection in Settings') : ''}
          >
            {proofreadState.status === 'loading'
              ? (lang === 'ja' ? 'AI校正中...' : 'Proofreading...')
              : (lang === 'ja' ? 'AI校正' : 'AI Proofread')}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRemoveLineBreaks}
            disabled={result.textBlocks.length === 0 && !result.fullText}
            title={lang === 'ja' ? '段落区切り以外の改行を削除' : 'Remove line breaks (keep paragraph breaks)'}
          >
            {lang === 'ja' ? '改行削除' : 'Remove LB'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
            {copied
              ? lang === 'ja' ? 'コピーしました！' : 'Copied!'
              : lang === 'ja' ? 'コピー' : 'Copy'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleDownload}>
            TXT
          </button>
          {hasBatchResults && onBatchTextExport && (
            <button className="btn btn-secondary btn-sm" onClick={onBatchTextExport}>
              {lang === 'ja' ? '一括TXT' : 'Batch TXT'}
            </button>
          )}
        </div>
      </div>

      {/* Search & Replace bar */}
      {showSearchBar && (
        <div className="text-editor-search-bar">
          <div className="text-editor-search-controls">
            <input
              type="text"
              className="text-editor-search-input"
              placeholder={lang === 'ja' ? '検索' : 'Find'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentMatchIndex(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNextMatch()
                else if (e.key === 'Escape') setShowSearchBar(false)
              }}
            />
            <span className="text-editor-search-count">
              {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : lang === 'ja' ? 'マッチなし' : 'No match'}
            </span>
            <button
              className="btn btn-sm btn-icon"
              onClick={handlePreviousMatch}
              disabled={searchMatches.length === 0}
              title={lang === 'ja' ? '前へ' : 'Previous'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 12l-4-4 4-4" />
              </svg>
            </button>
            <button
              className="btn btn-sm btn-icon"
              onClick={handleNextMatch}
              disabled={searchMatches.length === 0}
              title={lang === 'ja' ? '次へ' : 'Next'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          </div>
          <div className="text-editor-replace-controls">
            <input
              type="text"
              className="text-editor-replace-input"
              placeholder={lang === 'ja' ? '置換' : 'Replace'}
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplace()
                else if (e.key === 'Escape') setShowSearchBar(false)
              }}
            />
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleReplace}
              disabled={searchMatches.length === 0}
              title={lang === 'ja' ? '1つ置換' : 'Replace'}
            >
              {lang === 'ja' ? '置換' : 'Replace'}
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleReplaceAll}
              disabled={searchMatches.length === 0}
              title={lang === 'ja' ? 'すべて置換' : 'Replace All'}
            >
              {lang === 'ja' ? 'すべて置換' : 'Replace All'}
            </button>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setShowSearchBar(false)}
              title={lang === 'ja' ? '閉じる' : 'Close'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* AI校正ステータス表示 */}
      {(proofreadState.status === 'loading' || proofreadState.status === 'error') && (
        <div className="text-editor-ai-status">
          {proofreadState.status === 'loading' && <span className="ai-bar-spinner" />}
          {proofreadState.status === 'error' && (
            <span className="ai-bar-error" title={proofreadState.message}>
              {lang === 'ja' ? '校正エラー' : 'Proofread Error'}
            </span>
          )}
        </div>
      )}

      {/* 選択ブロックの表示 */}
      {selectedPageBlockText != null && (
        <div className="text-editor-selection">
          <div className="text-editor-selection-label">
            {lang === 'ja' ? 'ブロック内のテキスト:' : 'Block text:'}
          </div>
          <div className="text-editor-selection-text">{selectedPageBlockText || '(空)'}</div>
        </div>
      )}
      {selectedBlocksInfo && selectedPageBlockText == null && (
        <div className="text-editor-selection">
          <div className="text-editor-selection-label">
            {lang === 'ja'
              ? `選択ブロック (${selectedBlocksInfo.count}件):`
              : `Selected blocks (${selectedBlocksInfo.count}):`}
            {selectedBlocksInfo.hasNonExcluded && onExcludeBlocks && (
              <button className="btn btn-secondary btn-sm text-editor-exclude-btn" onClick={onExcludeBlocks}>
                {lang === 'ja' ? '除外' : 'Exclude'}
              </button>
            )}
            {selectedBlocksInfo.hasExcluded && onRestoreBlocks && (
              <button className="btn btn-secondary btn-sm text-editor-restore-btn" onClick={onRestoreBlocks}>
                {lang === 'ja' ? '復活' : 'Restore'}
              </button>
            )}
          </div>
          <div className="text-editor-selection-text">{selectedBlocksInfo.text || '(空)'}</div>
        </div>
      )}

      {/* メイン: テキストエリア or 差分表示 */}
      <div className="text-editor-body">
        {result.textBlocks.length === 0 && !result.fullText ? (
          <p className="text-editor-empty-text">
            {lang === 'ja' ? 'テキストが検出されませんでした' : 'No text detected'}
          </p>
        ) : shouldShowDiff ? (
          <DiffView
            originalText={proofreadState.originalText}
            correctedText={proofreadState.correctedText}
            onAcceptAll={handleAcceptAll}
            onRejectAll={handleRejectAll}
            onApplySelective={(text) => {
              setEditedText(text)
              onTextChange?.(text)
              setProofreadState({ status: 'idle' })
            }}
            lang={lang}
          />
        ) : (
          <div className={`line-numbers-container ${isVertical ? 'text-editor-vertical' : ''}`}>
            {showLineNumbers && !isVertical && (
              <div className="line-numbers-gutter" ref={gutterRef}>
                {Array.from({ length: lineCount }).map((_, i) => (
                  <span key={i} className="line-number">
                    {i + 1}
                  </span>
                ))}
              </div>
            )}
            {showLineNumbers && isVertical && (
              <div className="line-numbers-gutter-vertical" ref={gutterRef}>
                {Array.from({ length: lineCount }).map((_, i) => (
                  <span key={i} className="line-number">
                    {i + 1}
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="text-editor-textarea"
              value={displayText}
              onChange={handleTextChange}
              onScroll={handleTextareaScroll}
              spellCheck={false}
              style={{
                fontSize: `${fontSize}px`,
                writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                textOrientation: isVertical ? 'mixed' : 'initial',
              }}
            />
          </div>
        )}
      </div>

      {/* フッターオプション */}
      <div className="text-editor-footer">
        <div className="text-editor-options">
          <label className="text-editor-option">
            <input
              type="checkbox"
              checked={includeFileName}
              onChange={(e) => setIncludeFileName(e.target.checked)}
            />
            {lang === 'ja' ? 'ファイル名を記載' : 'Include filename'}
          </label>
          <label className="text-editor-option">
            <input
              type="checkbox"
              checked={ignoreNewlines}
              onChange={(e) => setIgnoreNewlines(e.target.checked)}
            />
            {lang === 'ja' ? 'コピー/DL時に改行を除去' : 'Remove newlines on copy/download'}
          </label>
        </div>
        <div className="text-editor-font-controls">
          <label className="text-editor-font-label">
            {lang === 'ja' ? 'フォントサイズ' : 'Font size'}:
          </label>
          <input
            type="range"
            className="text-editor-font-slider"
            min="10"
            max="24"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            title={`${fontSize}px`}
          />
          <span className="text-editor-font-value">{fontSize}px</span>
        </div>
      </div>
    </div>
  )
}
