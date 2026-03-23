import type { Language } from '../../i18n'

interface BottomToolbarProps {
  lang: Language
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload image/PDF
          </span>
        </button>
      </div>
      <div className="bottom-toolbar-right">
        {hasResults && ocrTimeMs != null && (
          <span className="bottom-stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            OCR {(ocrTimeMs / 1000).toFixed(1)}s
          </span>
        )}
        {aiTimeMs != null && (
          <span className="bottom-stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
              <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93" />
              <path d="M12 18v4" />
              <path d="M8 22h8" />
              <path d="M12 10v8" />
            </svg>
            AI {(aiTimeMs / 1000).toFixed(1)}s
          </span>
        )}
        {correctionCount != null && correctionCount > 0 && (
          <span className="bottom-stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {correctionCount} {lang === 'ja' ? '件修正' : 'corrections'}
          </span>
        )}
      </div>
    </div>
  )
}
