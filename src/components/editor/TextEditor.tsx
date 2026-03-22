import { useState, useCallback } from 'react'
import type { OCRResult, TextBlock } from '../../types/ocr'
import type { AIConnector } from '../../types/ai'
import { downloadText, copyToClipboard } from '../../utils/textExport'
import { DiffView } from './DiffView'

interface TextEditorProps {
  result: OCRResult | null
  selectedBlock: TextBlock | null
  selectedPageBlockText: string | null
  lang: 'ja' | 'en'
  onTextChange?: (text: string) => void
  aiConnector: AIConnector | null
  imageDataUrl?: string
}

type ProofreadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; originalText: string; correctedText: string }
  | { status: 'error'; message: string }

export function TextEditor({
  result,
  selectedBlock,
  selectedPageBlockText,
  lang,
  onTextChange,
  aiConnector,
  imageDataUrl,
}: TextEditorProps) {
  const [editedText, setEditedText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [includeFileName, setIncludeFileName] = useState(false)
  const [ignoreNewlines, setIgnoreNewlines] = useState(false)
  const [proofreadState, setProofreadState] = useState<ProofreadState>({ status: 'idle' })

  // editedText が null なら result.fullText を使う
  const displayText = editedText ?? result?.fullText ?? ''

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      setEditedText(newText)
      onTextChange?.(newText)
    },
    [onTextChange],
  )

  // result が変わったら編集状態・校正状態をリセット
  const [prevResultId, setPrevResultId] = useState<string | null>(null)
  if (result && result.id !== prevResultId) {
    setPrevResultId(result.id)
    setEditedText(null)
    setProofreadState({ status: 'idle' })
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

  // AI校正実行
  const handleProofread = useCallback(async () => {
    if (!aiConnector || !result) return
    const textToProofread = editedText ?? result.fullText
    setProofreadState({ status: 'loading' })
    try {
      const proofResult = await aiConnector.proofread(textToProofread, imageDataUrl ?? '')
      setProofreadState({
        status: 'done',
        originalText: textToProofread,
        correctedText: proofResult.correctedText,
      })
    } catch (err) {
      setProofreadState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [aiConnector, result, editedText, imageDataUrl])

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

  if (!result) {
    return (
      <div className="text-editor empty">
        <p>{lang === 'ja' ? '結果なし' : 'No results'}</p>
      </div>
    )
  }

  const showDiff = proofreadState.status === 'done'

  return (
    <div className="text-editor">
      {/* ヘッダー: タイトル + ボタン群（AI校正 / Copy / DL） */}
      <div className="text-editor-header">
        <div className="text-editor-header-left">
          <span className="text-editor-label">OCR result</span>
          <span className="text-editor-stats">
            {result.textBlocks.length}
            {lang === 'ja' ? ' 領域' : ' regions'}
            {' · '}
            {(result.processingTimeMs / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="text-editor-header-buttons">
          <button
            className="btn btn-ai"
            onClick={handleProofread}
            disabled={!aiConnector || proofreadState.status === 'loading' || result.textBlocks.length === 0}
            title={!aiConnector ? (lang === 'ja' ? '設定でAI接続を構成してください' : 'Configure AI connection in Settings') : ''}
          >
            {proofreadState.status === 'loading'
              ? (lang === 'ja' ? 'AI校正中...' : 'Proofreading...')
              : (lang === 'ja' ? 'AI校正' : 'AI Proofread')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
            {copied
              ? lang === 'ja' ? 'コピーしました！' : 'Copied!'
              : lang === 'ja' ? 'コピー' : 'Copy'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleDownload}>
            {lang === 'ja' ? 'ダウンロード' : 'Download'}
          </button>
        </div>
      </div>

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
      {selectedBlock && selectedPageBlockText == null && (
        <div className="text-editor-selection">
          <div className="text-editor-selection-label">
            {lang === 'ja' ? '選択領域のテキスト:' : 'Selected region:'}
          </div>
          <div className="text-editor-selection-text">{selectedBlock.text || '(空)'}</div>
        </div>
      )}

      {/* メイン: テキストエリア or 差分表示 */}
      <div className="text-editor-body">
        {result.textBlocks.length === 0 ? (
          <p className="text-editor-empty-text">
            {lang === 'ja' ? 'テキストが検出されませんでした' : 'No text detected'}
          </p>
        ) : showDiff ? (
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
          <textarea
            className="text-editor-textarea"
            value={displayText}
            onChange={handleTextChange}
            spellCheck={false}
          />
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
            {lang === 'ja' ? '改行を無視' : 'Ignore newlines'}
          </label>
        </div>
      </div>
    </div>
  )
}
