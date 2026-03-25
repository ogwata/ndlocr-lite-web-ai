import { useState, useEffect, useCallback } from 'react'
import type { AISettings, AIConnector } from '../types/ai'
import { DEFAULT_AI_SETTINGS } from '../types/ai'
import { saveApiKey, loadApiKey } from '../utils/crypto'
import { createDirectApiConnector } from '../ai/direct-api'
import { createMCPConnector } from '../ai/mcp-connector'

const SETTINGS_STORAGE_KEY = 'ndlocr_ai_settings'

/** APIキーを除いた設定を localStorage に保存 */
function saveSettingsToStorage(settings: AISettings): void {
  const toStore = {
    ...settings,
    directApi: { ...settings.directApi, apiKey: '' },
  }
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(toStore))
}

/** localStorage から設定を読み込み（APIキーは別途暗号化ストアから） */
function loadSettingsFromStorage(): AISettings {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!stored) return { ...DEFAULT_AI_SETTINGS }
  try {
    const parsed = JSON.parse(stored) as Partial<AISettings>
    return {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
      directApi: { ...DEFAULT_AI_SETTINGS.directApi, ...parsed.directApi, apiKey: '' },
      mcp: { ...DEFAULT_AI_SETTINGS.mcp, ...parsed.mcp },
    }
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}

export type AIConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings>(loadSettingsFromStorage)
  const [connectionStatus, setConnectionStatus] = useState<AIConnectionStatus>('disconnected')
  const [connector, setConnector] = useState<AIConnector | null>(null)

  // 初回: 暗号化済みAPIキーを復号してstateに反映
  useEffect(() => {
    loadApiKey(settings.directApi.provider).then((key) => {
      if (key) {
        setSettings((prev) => ({
          ...prev,
          directApi: { ...prev.directApi, apiKey: key },
        }))
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 設定を更新（自動保存） */
  const updateSettings = useCallback((update: Partial<AISettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...update }
      if (update.directApi) {
        next.directApi = { ...prev.directApi, ...update.directApi }
      }
      if (update.mcp) {
        next.mcp = { ...prev.mcp, ...update.mcp }
      }
      saveSettingsToStorage(next)
      // APIキーが変更された場合は暗号化保存
      if (update.directApi?.apiKey !== undefined) {
        saveApiKey(next.directApi.provider, next.directApi.apiKey)
      }
      return next
    })
    // 設定変更したら接続状態をリセット
    setConnectionStatus('disconnected')
    setConnector(null)
  }, [])

  /** プロバイダ変更時にAPIキーを読み込む */
  const switchProvider = useCallback(async (provider: AISettings['directApi']['provider']) => {
    const key = await loadApiKey(provider)
    setSettings((prev) => {
      const next = {
        ...prev,
        directApi: {
          ...prev.directApi,
          provider,
          apiKey: key,
          model: '',
        },
      }
      saveSettingsToStorage(next)
      return next
    })
    setConnectionStatus('disconnected')
    setConnector(null)
  }, [])

  /** 接続テスト & コネクタ作成 */
  const testAndConnect = useCallback(async (): Promise<boolean> => {
    setConnectionStatus('connecting')
    try {
      let newConnector: AIConnector
      if (settings.mode === 'direct') {
        if (!settings.directApi.apiKey) {
          setConnectionStatus('error')
          return false
        }
        newConnector = createDirectApiConnector(settings.directApi, settings.customPrompt)
      } else {
        if (!settings.mcp.serverUrl) {
          setConnectionStatus('error')
          return false
        }
        newConnector = createMCPConnector(settings.mcp, settings.customPrompt)
      }

      const ok = await newConnector.testConnection()
      if (ok) {
        setConnector(newConnector)
        setConnectionStatus('connected')
        return true
      } else {
        setConnectionStatus('error')
        return false
      }
    } catch {
      setConnectionStatus('error')
      return false
    }
  }, [settings])

  /** 現在の設定でコネクタを取得（接続テストなし）
   *  @param promptOverride 文書言語が埋め込まれたプロンプト（省略時はsettings.customPrompt）
   */
  const getConnector = useCallback((promptOverride?: string): AIConnector | null => {
    // promptOverrideがある場合は新規生成（文書言語ごとに異なるため）
    const prompt = promptOverride ?? settings.customPrompt
    if (!promptOverride && connector) return connector
    if (settings.mode === 'direct' && settings.directApi.apiKey) {
      return createDirectApiConnector(settings.directApi, prompt)
    }
    if (settings.mode === 'mcp' && settings.mcp.serverUrl) {
      return createMCPConnector(settings.mcp, prompt)
    }
    return null
  }, [connector, settings])

  return {
    settings,
    updateSettings,
    switchProvider,
    connectionStatus,
    testAndConnect,
    getConnector,
  }
}
