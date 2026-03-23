import type { Language } from '../../i18n'

interface FooterProps {
  lang: Language
  githubUrl?: string
}

export function Footer({ lang, githubUrl = 'https://github.com/ogwata/ndlocr-lite-web-ai' }: FooterProps) {
  return (
    <footer className="footer">
      <div className="footer-privacy">
        <span className="privacy-icon">🔒</span>
        {lang === 'ja' ? (
          <span>
            このシステムは{' '}
            <a href="https://www.npmjs.com/package/onnxruntime-web" target="_blank" rel="noopener noreferrer">
              ONNX Web Runtime
            </a>{' '}
            技術を使用しており、Webブラウザで完結して動作します。選択した画像とOCR結果はあなたのPCの外部には送信されません。
          </span>
        ) : (
          <span>
            This system uses{' '}
            <a href="https://www.npmjs.com/package/onnxruntime-web" target="_blank" rel="noopener noreferrer">
              ONNX Web Runtime
            </a>{' '}
            and runs entirely in your browser. Selected images and OCR results are never sent to any external server.
          </span>
        )}
      </div>
      <div className="footer-attribution">
        {lang === 'ja' ? (
          <span className="footer-attribution-text">
            本ツールは国立国会図書館（NDL Lab）が開発した{' '}
            <a href="https://github.com/ndl-lab/ndlocr-lite" target="_blank" rel="noopener noreferrer">
              NDLOCR-Lite
            </a>{' '}
            のWebブラウザ版です。OCRモデルはNDLOCR-Liteのものを使用しています。
          </span>
        ) : (
          <span className="footer-attribution-text">
            This tool is a web browser port of{' '}
            <a href="https://github.com/ndl-lab/ndlocr-lite" target="_blank" rel="noopener noreferrer">
              NDLOCR-Lite
            </a>{' '}
            developed by the National Diet Library of Japan (NDL Lab). OCR models are from NDLOCR-Lite.
          </span>
        )}
      </div>
      <div className="footer-credits">
        <div className="footer-credit-line">
          {lang === 'ja' ? 'OCRエンジン: ' : 'OCR engine: '}
          <a href="https://github.com/ndl-lab/ndlocr-lite" target="_blank" rel="noopener noreferrer">
            NDLOCR-Lite
          </a>
          {lang === 'ja' ? '（国立国会図書館）' : ' (National Diet Library of Japan)'}
        </div>
        <div className="footer-credit-line">
          {lang === 'ja' ? 'Web移植: ' : 'Web port: '}
          <a href="https://github.com/yuta1984/ndlocrlite-web" target="_blank" rel="noopener noreferrer">
            {lang === 'ja' ? '橋本雄太' : 'Yuta Hashimoto'}
          </a>
          {lang === 'ja' ? '（国立歴史民俗博物館）' : ' (National Museum of Japanese History)'}
        </div>
        <div className="footer-credit-line">
          {lang === 'ja' ? 'AI校正機能: ' : 'AI proofreading: '}
          {lang === 'ja' ? '小形克宏（一般社団法人ビブリオスタイル）' : 'Katsuhiro Ogata (Bibliostyle)'}
        </div>
        <div className="footer-credit-line">
          {lang === 'ja' ? 'UI拡張機能（ダークモード、デザイン、画像前処理）: ' : 'UI enhancements (dark mode, design, image preprocessing): '}
          <a href="https://researchmap.jp/SoMiyagawa" target="_blank" rel="noopener noreferrer">
            {lang === 'ja' ? '宮川創' : 'So Miyagawa'}
          </a>
          {lang === 'ja' ? '（筑波大学）' : ' (University of Tsukuba)'}
        </div>
      </div>
      <div className="footer-meta">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-github"
        >
          {lang === 'ja' ? 'GitHubリポジトリ' : 'GitHub Repository'} ↗
        </a>
      </div>
    </footer>
  )
}
