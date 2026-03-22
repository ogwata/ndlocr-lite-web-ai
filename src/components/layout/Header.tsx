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
        <span className="header-version">v3.0</span>
      </button>
      <div className="header-actions">
        <span className={statusClass} title={statusText}>
          <span className="ai-status-dot" />
          <span className="ai-status-text">{statusText}</span>
        </span>
        <button className="btn-icon" onClick={onOpenHistory} title={lang === 'ja' ? '処理履歴' : 'History'}>
          📋
        </button>
        <button className="btn-icon" onClick={onOpenSettings} title={lang === 'ja' ? '設定' : 'Settings'}>
          ⚙️
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
