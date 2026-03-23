import { useEffect, useState } from 'react'
import type { TextBlock } from '../../types/ocr'
import type { Language } from '../../i18n'

interface RegionOCRDialogProps {
  cropDataUrl: string
  isProcessing: boolean
  result: { textBlocks: TextBlock[]; fullText: string } | null
  lang: Language
  onClose: () => void
}

export function RegionOCRDialog({ cropDataUrl, isProcessing, result, lang, onClose }: RegionOCRDialogProps) {
  const [copied, setCopied] = useState(false)
  const [ignoreNewlines, setIgnoreNewlines] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleCopy = async () => {
    if (!result?.fullText) return
    const text = ignoreNewlines ? result.fullText.replace(/\n/g, '') : result.fullText
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="region-ocr-backdrop" onClick={onClose}>
      <div className="region-ocr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="region-ocr-header">
          <span className="region-ocr-title">
            {lang === 'ja' ? '選択領域の OCR 結果' : 'Region OCR Result'}
          </span>
          <button className="region-ocr-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="region-ocr-preview-wrap">
          <img src={cropDataUrl} alt="selected region" className="region-ocr-preview" />
        </div>

        <div className="region-ocr-body">
          {isProcessing ? (
            <div className="region-ocr-processing">
              <div className="file-loading-spinner" />
              <span>{lang === 'ja' ? '認識中...' : 'Recognizing...'}</span>
            </div>
          ) : result && result.fullText ? (
            <textarea
              className="region-ocr-textarea"
              readOnly
              value={result.fullText}
            />
          ) : (
            <p className="region-ocr-empty">
              {lang === 'ja' ? 'テキストが見つかりませんでした' : 'No text found'}
            </p>
          )}
        </div>

        <div className="region-ocr-footer">
          <label className="result-actions-option">
            <input
              type="checkbox"
              checked={ignoreNewlines}
              onChange={(e) => setIgnoreNewlines(e.target.checked)}
            />
            {lang === 'ja' ? '改行を無視する' : 'Ignore newlines'}
          </label>
          <button
            className="btn btn-primary"
            onClick={handleCopy}
            disabled={isProcessing || !result?.fullText}
          >
            {copied
              ? (lang === 'ja' ? 'コピーしました' : 'Copied!')
              : (lang === 'ja' ? 'コピー' : 'Copy')}
          </button>
        </div>
      </div>
    </div>
  )
}
