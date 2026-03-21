interface BottomToolbarProps {
  lang: 'ja' | 'en'
  onUpload: () => void
  ocrTimeMs?: number
  aiTimeMs?: number
  correctionCount?: number
  hasResults: boolean
}

export function BottomToolbar({
  lang,
  onUpload,
  ocrTimeMs,
  aiTimeMs,
  correctionCount,
  hasResults,
}: BottomToolbarProps) {
  return (
    <div className="bottom-toolbar">
      <div className="bottom-toolbar-left">
        <button className="btn btn-primary btn-sm" onClick={onUpload}>
          {lang === 'ja' ? 'Upload image/PDF' : 'Upload image/PDF'}
        </button>
      </div>
      <div className="bottom-toolbar-right">
        {hasResults && ocrTimeMs != null && (
          <span className="bottom-stat">
            OCR: {(ocrTimeMs / 1000).toFixed(1)}s
          </span>
        )}
        {aiTimeMs != null && (
          <span className="bottom-stat">
            AI: {(aiTimeMs / 1000).toFixed(1)}s
          </span>
        )}
        {correctionCount != null && correctionCount > 0 && (
          <span className="bottom-stat">
            {correctionCount} {lang === 'ja' ? '件修正' : 'corrections'}
          </span>
        )}
      </div>
    </div>
  )
}
