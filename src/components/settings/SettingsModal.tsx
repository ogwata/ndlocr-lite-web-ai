import { useState } from 'react'
import { clearModels } from '../../utils/db'
import type { AISettings, AIProvider, AIConnectionMode } from '../../types/ai'
import { DEFAULT_MODELS, DEFAULT_PROOFREAD_PROMPT } from '../../types/ai'
import type { AIConnectionStatus } from '../../hooks/useAISettings'
import type { Language } from '../../i18n'
import type { ModelConfig, RecognitionLanguage } from '../../types/model-config'
import { LANGUAGE_LABELS as MODEL_LANG_LABELS, LANGUAGE_DESCRIPTIONS, DOWNLOAD_SIZES, MATH_DOWNLOAD_SIZE, saveModelConfig } from '../../types/model-config'

interface SettingsModalProps {
  onClose: () => void
  lang: Language
  aiSettings: AISettings
  onUpdateAISettings: (update: Partial<AISettings>) => void
  onSwitchProvider: (provider: AIProvider) => Promise<void>
  connectionStatus: AIConnectionStatus
  onTestConnection: () => Promise<boolean>
  modelConfig: ModelConfig
  onUpdateModelConfig: (config: ModelConfig) => void
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
  groq: 'Groq',
  custom: 'Custom Endpoint',
}

export function SettingsModal({
  onClose,
  lang,
  aiSettings,
  onUpdateAISettings,
  onSwitchProvider,
  connectionStatus,
  onTestConnection,
  modelConfig,
  onUpdateModelConfig,
}: SettingsModalProps) {
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [activeTab, setActiveTab] = useState<'ai' | 'ocr-model' | 'cache'>('ai')
  const [pendingModelConfig, setPendingModelConfig] = useState<ModelConfig>(modelConfig)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)

  const handleClearModels = async () => {
    if (!window.confirm(
      lang === 'ja'
        ? 'キャッシュされたONNXモデルを削除しますか？次回起動時に再ダウンロードが必要です。'
        : 'Delete cached ONNX models? They will be re-downloaded on next startup.'
    )) return

    setClearing(true)
    try {
      await clearModels()
      setCleared(true)
      setTimeout(() => setCleared(false), 2000)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setClearing(false)
    }
  }

  const handleTestConnection = async () => {
    setTestResult(null)
    const ok = await onTestConnection()
    setTestResult(ok ? 'success' : 'fail')
    setTimeout(() => setTestResult(null), 3000)
  }

  const handleModeChange = (mode: AIConnectionMode) => {
    onUpdateAISettings({ mode })
  }

  const handleProviderChange = async (provider: AIProvider) => {
    await onSwitchProvider(provider)
    // デフォルトモデルを設定
    const models = DEFAULT_MODELS[provider]
    if (models.length > 0) {
      onUpdateAISettings({ directApi: { ...aiSettings.directApi, provider, model: models[0] } })
    }
  }

  const statusLabel = (() => {
    switch (connectionStatus) {
      case 'connected': return lang === 'ja' ? '接続済み' : 'Connected'
      case 'connecting': return lang === 'ja' ? '接続中...' : 'Connecting...'
      case 'error': return lang === 'ja' ? '接続エラー' : 'Connection Error'
      default: return lang === 'ja' ? '未接続' : 'Disconnected'
    }
  })()

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{lang === 'ja' ? '設定' : 'Settings'}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* タブ */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            {lang === 'ja' ? 'AI接続' : 'AI Connection'}
          </button>
          <button
            className={`settings-tab ${activeTab === 'ocr-model' ? 'active' : ''}`}
            onClick={() => setActiveTab('ocr-model')}
          >
            {lang === 'ja' ? 'OCRモデル' : 'OCR Model'}
          </button>
          <button
            className={`settings-tab ${activeTab === 'cache' ? 'active' : ''}`}
            onClick={() => setActiveTab('cache')}
          >
            {lang === 'ja' ? 'キャッシュ' : 'Cache'}
          </button>
        </div>

        <div className="panel-body">
          {/* ===== AI接続タブ ===== */}
          {activeTab === 'ai' && (
            <>
              {/* 接続モード切替 */}
              <section className="settings-section">
                <h3>{lang === 'ja' ? '接続モード' : 'Connection Mode'}</h3>
                <div className="settings-mode-toggle">
                  <button
                    className={`btn ${aiSettings.mode === 'direct' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleModeChange('direct')}
                  >
                    Direct API
                  </button>
                  <button
                    className={`btn ${aiSettings.mode === 'mcp' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleModeChange('mcp')}
                  >
                    MCP Server
                  </button>
                </div>
              </section>

              {/* Direct API設定 */}
              {aiSettings.mode === 'direct' && (
                <section className="settings-section">
                  <h3>{lang === 'ja' ? 'プロバイダ' : 'Provider'}</h3>
                  <select
                    className="settings-select"
                    value={aiSettings.directApi.provider}
                    onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
                  >
                    {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>

                  {/* APIキー */}
                  <h3>{lang === 'ja' ? 'APIキー' : 'API Key'}</h3>
                  <input
                    type="password"
                    className="settings-input"
                    value={aiSettings.directApi.apiKey}
                    onChange={(e) => onUpdateAISettings({
                      directApi: { ...aiSettings.directApi, apiKey: e.target.value },
                    })}
                    placeholder={lang === 'ja' ? 'APIキーを入力' : 'Enter API key'}
                  />
                  <p className="settings-description">
                    {lang === 'ja'
                      ? 'APIキーはブラウザ内で暗号化して保存されます。サーバーには送信されません。'
                      : 'API keys are encrypted and stored locally. They are never sent to our servers.'}
                  </p>

                  {/* モデル選択 */}
                  <h3>{lang === 'ja' ? 'モデル' : 'Model'}</h3>
                  {DEFAULT_MODELS[aiSettings.directApi.provider].length > 0 ? (
                    <select
                      className="settings-select"
                      value={aiSettings.directApi.model}
                      onChange={(e) => onUpdateAISettings({
                        directApi: { ...aiSettings.directApi, model: e.target.value },
                      })}
                    >
                      <option value="">{lang === 'ja' ? 'モデルを選択' : 'Select model'}</option>
                      {DEFAULT_MODELS[aiSettings.directApi.provider].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      value={aiSettings.directApi.model}
                      onChange={(e) => onUpdateAISettings({
                        directApi: { ...aiSettings.directApi, model: e.target.value },
                      })}
                      placeholder={lang === 'ja' ? 'モデル名を入力' : 'Enter model name'}
                    />
                  )}

                  {/* カスタムエンドポイント */}
                  {aiSettings.directApi.provider === 'custom' && (
                    <>
                      <h3>{lang === 'ja' ? 'エンドポイントURL' : 'Endpoint URL'}</h3>
                      <input
                        type="url"
                        className="settings-input"
                        value={aiSettings.directApi.endpoint ?? ''}
                        onChange={(e) => onUpdateAISettings({
                          directApi: { ...aiSettings.directApi, endpoint: e.target.value },
                        })}
                        placeholder="https://..."
                      />
                    </>
                  )}
                </section>
              )}

              {/* MCP Server設定 */}
              {aiSettings.mode === 'mcp' && (
                <section className="settings-section">
                  <h3>{lang === 'ja' ? 'MCPサーバーURL' : 'MCP Server URL'}</h3>
                  <input
                    type="url"
                    className="settings-input"
                    value={aiSettings.mcp.serverUrl}
                    onChange={(e) => onUpdateAISettings({
                      mcp: { ...aiSettings.mcp, serverUrl: e.target.value },
                    })}
                    placeholder="http://localhost:3000/mcp"
                  />
                  <p className="settings-description">
                    {lang === 'ja'
                      ? 'MCPプロトコル対応のサーバーURLを指定してください。Streamable HTTP Transportを使用します。'
                      : 'Specify the URL of your MCP-compatible server. Uses Streamable HTTP Transport.'}
                  </p>

                  <h3>{lang === 'ja' ? 'ツール名（任意）' : 'Tool Name (optional)'}</h3>
                  <input
                    type="text"
                    className="settings-input"
                    value={aiSettings.mcp.toolName ?? ''}
                    onChange={(e) => onUpdateAISettings({
                      mcp: { ...aiSettings.mcp, toolName: e.target.value || undefined },
                    })}
                    placeholder={lang === 'ja' ? '空欄で自動検出' : 'Leave empty for auto-detection'}
                  />
                </section>
              )}

              {/* 校正プロンプト */}
              <section className="settings-section">
                <h3>{lang === 'ja' ? '校正プロンプト' : 'Proofreading Prompt'}</h3>
                <textarea
                  className="settings-textarea"
                  value={aiSettings.customPrompt}
                  onChange={(e) => onUpdateAISettings({ customPrompt: e.target.value })}
                  rows={6}
                />
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => onUpdateAISettings({ customPrompt: DEFAULT_PROOFREAD_PROMPT })}
                >
                  {lang === 'ja' ? 'デフォルトに戻す' : 'Reset to Default'}
                </button>
              </section>

              {/* 接続テスト */}
              <section className="settings-section">
                <div className="settings-connection-row">
                  <button
                    className="btn btn-primary"
                    onClick={handleTestConnection}
                    disabled={connectionStatus === 'connecting'}
                  >
                    {connectionStatus === 'connecting'
                      ? (lang === 'ja' ? 'テスト中...' : 'Testing...')
                      : (lang === 'ja' ? '接続テスト' : 'Test Connection')}
                  </button>
                  <span className={`settings-connection-status status-${connectionStatus}`}>
                    {statusLabel}
                  </span>
                  {testResult === 'success' && (
                    <span className="settings-test-ok">
                      {lang === 'ja' ? '成功' : 'Success'}
                    </span>
                  )}
                  {testResult === 'fail' && (
                    <span className="settings-test-fail">
                      {lang === 'ja' ? '失敗' : 'Failed'}
                    </span>
                  )}
                </div>
              </section>
            </>
          )}

          {/* ===== OCRモデルタブ ===== */}
          {activeTab === 'ocr-model' && (
            <section className="settings-section">
              <h3>{lang === 'ja' ? '認識言語' : 'Recognition Language'}</h3>
              <div className="settings-model-options">
                {(['ja', 'european'] as RecognitionLanguage[]).map((langKey) => (
                  <label key={langKey} className="settings-model-option">
                    <input
                      type="radio"
                      name="recognition-language"
                      value={langKey}
                      checked={pendingModelConfig.language === langKey}
                      onChange={() => setPendingModelConfig(prev => ({ ...prev, language: langKey }))}
                    />
                    <div className="settings-model-option-content">
                      <div className="settings-model-option-header">
                        <span className="settings-model-option-label">
                          {MODEL_LANG_LABELS[lang]?.[langKey] ?? MODEL_LANG_LABELS.en[langKey]}
                        </span>
                        <span className="settings-model-option-size">{DOWNLOAD_SIZES[langKey]}</span>
                      </div>
                      <span className="settings-model-option-desc">
                        {LANGUAGE_DESCRIPTIONS[lang]?.[langKey] ?? LANGUAGE_DESCRIPTIONS.en[langKey]}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <h3 style={{ marginTop: '1.5rem' }}>
                {lang === 'ja' ? '数式認識（オプション）' : 'Math Recognition (optional)'}
              </h3>
              <label className="settings-model-option">
                <input
                  type="checkbox"
                  checked={pendingModelConfig.mathEnabled}
                  onChange={(e) => setPendingModelConfig(prev => ({ ...prev, mathEnabled: e.target.checked }))}
                />
                <div className="settings-model-option-content">
                  <div className="settings-model-option-header">
                    <span className="settings-model-option-label">
                      {lang === 'ja' ? '数式認識を有効にする' : 'Enable math recognition'}
                    </span>
                    <span className="settings-model-option-size">+{MATH_DOWNLOAD_SIZE}</span>
                  </div>
                  <span className="settings-model-option-desc">
                    {lang === 'ja'
                      ? '数式画像をLaTeX形式で出力（MathJaxで表示）'
                      : 'Output math formulas as LaTeX (rendered with MathJax)'}
                  </span>
                </div>
              </label>

              <p className="settings-description" style={{ marginTop: '1rem' }}>
                {lang === 'ja'
                  ? '変更を適用するにはリロードが必要です。以前のモデルはキャッシュに残ります。'
                  : 'A reload is required to apply changes. Previous models remain cached.'}
              </p>

              {(pendingModelConfig.language !== modelConfig.language || pendingModelConfig.mathEnabled !== modelConfig.mathEnabled) && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => {
                    saveModelConfig(pendingModelConfig)
                    onUpdateModelConfig(pendingModelConfig)
                    window.location.reload()
                  }}
                >
                  {lang === 'ja' ? '適用してリロード' : 'Apply & Reload'}
                </button>
              )}
            </section>
          )}

          {/* ===== キャッシュタブ ===== */}
          {activeTab === 'cache' && (
            <section className="settings-section">
              <h3>{lang === 'ja' ? 'モデルキャッシュ' : 'Model Cache'}</h3>
              <p className="settings-description">
                {lang === 'ja'
                  ? 'ダウンロード済みのONNXモデルはIndexedDBにキャッシュされています。キャッシュをクリアすると次回起動時に再ダウンロードが必要です。'
                  : 'Downloaded ONNX models are cached in IndexedDB. Clearing the cache requires re-downloading on next startup.'}
              </p>
              <button
                className="btn btn-secondary"
                onClick={handleClearModels}
                disabled={clearing}
              >
                {cleared
                  ? (lang === 'ja' ? '✓ クリア完了' : '✓ Cleared')
                  : clearing
                    ? (lang === 'ja' ? 'クリア中...' : 'Clearing...')
                    : (lang === 'ja' ? 'モデルキャッシュをクリア' : 'Clear Model Cache')}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
