import type { OCRResult, TextBlock } from '../../types/ocr'
import type { Language } from '../../i18n'

interface ResultPanelProps {
  result: OCRResult | null
  selectedBlock: TextBlock | null
  selectedPageBlockText?: string | null
  lang: Language
}

export function ResultPanel({ result, selectedBlock, selectedPageBlockText, lang }: ResultPanelProps) {
  if (!result) {
    return (
      <div className="result-panel empty">
        <p>{lang === 'ja' ? '結果なし' : 'No results'}</p>
      </div>
    )
  }

  return (
    <div className="result-panel">
      <div className="result-header">
        <span className="result-filename">{result.fileName}</span>
        <span className="result-stats">
          {result.textBlocks.length}
          {lang === 'ja' ? ' 領域' : ' regions'}
          {' · '}
          {(result.processingTimeMs / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="result-text">
        {result.textBlocks.length === 0 ? (
          <p className="no-text">
            {lang === 'ja' ? 'テキストが検出されませんでした' : 'No text detected'}
          </p>
        ) : selectedPageBlockText != null ? (
          <div>
            <div className="selected-text-label">
              {lang === 'ja' ? 'ブロック内のテキスト:' : 'Block text:'}
            </div>
            <div className="selected-text">{selectedPageBlockText || '(空)'}</div>
            <hr className="divider" />
            <pre className="full-text">{result.fullText}</pre>
          </div>
        ) : selectedBlock ? (
          // 選択された領域のテキストをハイライト
          <div>
            <div className="selected-text-label">
              {lang === 'ja' ? '選択領域のテキスト:' : 'Selected region:'}
            </div>
            <div className="selected-text">{selectedBlock.text || '(空)'}</div>
            <hr className="divider" />
            <div className="full-text">{result.fullText}</div>
          </div>
        ) : (
          <pre className="full-text">{result.fullText}</pre>
        )}
      </div>
    </div>
  )
}
