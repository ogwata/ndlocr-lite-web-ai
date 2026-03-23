import type { Language } from '../../i18n'
import type { AIConnectionStatus } from '../../hooks/useAISettings'

interface HeaderProps {
  lang: Language
  onToggleLanguage: () => void
  onOpenSettings: () => void
  onOpenHistory: () => void
  onLogoClick: () => void
  aiConnectionStatus?: AIConnectionStatus
}

export function Header({
  lang,
  onToggleLanguage,
  onOpenSettings,
  onOpenHistory,
  onLogoClick,
  aiConnectionStatus = 'disconnected',
}: HeaderProps) {
  const statusClass = `ai-status ai-status-${aiConnectionStatus}`
  const statusText = (() => {
    switch (aiConnectionStatus) {
      case 'connected': return lang === 'ja' ? 'AI接続済み' : 'AI Connected'
      case 'connecting': return lang === 'ja' ? 'AI接続中...' : 'AI Connecting...'
      case 'error': return lang === 'ja' ? 'AI接続エラー' : 'AI Error'
      default: return lang === 'ja' ? 'AI未接続' : 'AI Disconnected'
    }
  })()

  return (
    <header className="header">
      <button className="header-title" onClick={onLogoClick}>
        <h1>NDLOCR-Lite Web AI</h1>
        <span className="header-version">v0.1.0</span>
      </button>
      <div className="header-actions">
        <span className={statusClass} title={statusText}>
          <span className="ai-status-dot" />
          <span className="ai-status-text">{statusText}</span>
        </span>
        <button className="btn-icon" onClick={onOpenHistory} title={lang === 'ja' ? '処理履歴' : 'History'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </button>
        <button className="btn-icon" onClick={onOpenSettings} title={lang === 'ja' ? '設定' : 'Settings'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <select
          className="select-lang"
          value={lang}
          onChange={onToggleLanguage}
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </div>
    </header>
  )
}
