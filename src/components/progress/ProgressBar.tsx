import { memo } from 'react'
import type { OCRJobState } from '../../types/ocr'
import type { Language } from '../../i18n'

interface ProgressBarProps {
  jobState: OCRJobState
  lang: Language
}

const MODEL_LABELS: Record<Language, { layout: string; rec30: string; rec50: string; rec100: string; downloading: string }> = {
  ja: {
    layout: 'レイアウト検出モデル',
    rec30: '文字認識モデル（≤30文字）',
    rec50: '文字認識モデル（≤50文字）',
    rec100: '文字認識モデル（≤100文字）',
    downloading: 'モデルをダウンロード中',
  },
  en: {
    layout: 'Layout detection model',
    rec30: 'Recognition model (≤30 chars)',
    rec50: 'Recognition model (≤50 chars)',
    rec100: 'Recognition model (≤100 chars)',
    downloading: 'Downloading models',
  },
}

export const ProgressBar = memo(function ProgressBar({ jobState, lang }: ProgressBarProps) {
  const { status, currentFileIndex, totalFiles, stageProgress, stage, message, modelProgress } = jobState

  if (status === 'idle') return null

  const isError = status === 'error'
  const isDone = status === 'done'
  const isDownloading = stage === 'loading_models' && modelProgress != null
  const labels = MODEL_LABELS[lang]

  if (isDownloading) {
    return (
      <div className="progress-container">
        <div className="progress-title">{labels.downloading}...</div>
        <div className="model-download-bars">
          {(
            [
              ['layout', labels.layout],
              ['rec30', labels.rec30],
              ['rec50', labels.rec50],
              ['rec100', labels.rec100],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="model-download-row">
              <div className="model-download-label">{label}</div>
              <div className="model-download-bar-wrap">
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.round(modelProgress[key] * 100)}%` }}
                  />
                </div>
                <span className="model-download-pct">{Math.round(modelProgress[key] * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 全体進捗: ファイル単位 + 現在ファイル内の進捗
  const overallProgress =
    totalFiles > 0
      ? ((currentFileIndex - 1 + stageProgress) / totalFiles) * 100
      : stageProgress * 100

  return (
    <div className={`progress-container ${isError ? 'error' : ''}`}>
      {totalFiles > 1 && (
        <div className="progress-files">
          {lang === 'ja'
            ? `${currentFileIndex} / ${totalFiles} ファイル`
            : `${currentFileIndex} / ${totalFiles} files`}
        </div>
      )}
      <div className="progress-bar-track">
        <div
          className={`progress-bar-fill ${isDone ? 'done' : ''}`}
          style={{ width: `${Math.min(100, overallProgress)}%` }}
        />
      </div>
      <div className="progress-message">
        {isError ? jobState.errorMessage : message}
      </div>
    </div>
  )
})
