import { useState } from 'react'
import type { DBRunEntry } from '../../types/db'
import type { Language } from '../../i18n'

interface HistoryPanelProps {
  runs: DBRunEntry[]
  onSelect: (entry: DBRunEntry) => void
  onClear: () => void
  onClose: () => void
  lang: Language
}

export function HistoryPanel({ runs, onSelect, onClear, onClose, lang }: HistoryPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClear = () => {
    if (confirmClear) {
      onClear()
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
    }
  }

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{lang === 'ja' ? '処理履歴' : 'History'}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          {runs.length === 0 ? (
            <p className="empty-message">
              {lang === 'ja' ? '処理履歴がありません' : 'No history yet'}
            </p>
          ) : (
            <ul className="history-list">
              {runs.map((run) => {
                const firstFile = run.files[0]
                const fileCount = run.files.length
                const previewText = run.files.map(f => f.fullText).join(' ').slice(0, 60)
                return (
                  <li key={run.id} className="history-item" onClick={() => onSelect(run)}>
                    {firstFile && (
                      <img
                        src={firstFile.imageDataUrl}
                        alt={firstFile.fileName}
                        className="history-thumb"
                      />
                    )}
                    <div className="history-info">
                      <span className="history-filename">
                        {fileCount === 1
                          ? firstFile?.fileName
                          : lang === 'ja'
                            ? `${firstFile?.fileName} 他${fileCount - 1}件`
                            : `${firstFile?.fileName} +${fileCount - 1} more`}
                      </span>
                      <span className="history-date">{formatDate(run.createdAt)}</span>
                      <span className="history-preview">
                        {previewText
                          ? previewText + '...'
                          : (lang === 'ja' ? 'テキストなし' : 'No text')}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="panel-footer">
          <button
            className={`btn ${confirmClear ? 'btn-danger' : 'btn-secondary'}`}
            onClick={handleClear}
            disabled={runs.length === 0}
          >
            {confirmClear
              ? (lang === 'ja' ? '本当に削除しますか？' : 'Confirm delete?')
              : (lang === 'ja' ? 'キャッシュをクリア' : 'Clear Cache')}
          </button>
        </div>
      </div>
    </div>
  )
}
