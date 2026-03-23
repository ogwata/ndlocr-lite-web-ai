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
  'zh-CN': {
    layout: '布局检测模型',
    rec30: '识别模型（≤30字符）',
    rec50: '识别模型（≤50字符）',
    rec100: '识别模型（≤100字符）',
    downloading: '正在下载模型',
  },
  'zh-TW': {
    layout: '佈局偵測模型',
    rec30: '識別模型（≤30字符）',
    rec50: '識別模型（≤50字符）',
    rec100: '識別模型（≤100字符）',
    downloading: '正在下載模型',
  },
  ko: {
    layout: '레이아웃 감지 모델',
    rec30: '인식 모델 (≤30문자)',
    rec50: '인식 모델 (≤50문자)',
    rec100: '인식 모델 (≤100문자)',
    downloading: '모델 다운로드 중',
  },
}

export function ProgressBar({ jobState, lang }: ProgressBarProps) {
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
}
