/** AI接続モード */
export type AIConnectionMode = 'direct' | 'mcp'

/** Direct APIプロバイダ */
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'groq' | 'custom'

/** プロバイダ設定 */
export interface ProviderConfig {
  provider: AIProvider
  apiKey: string
  model: string
  endpoint?: string // カスタムエンドポイント用
}

/** MCP Server設定 */
export interface MCPConfig {
  serverUrl: string // SSEエンドポイント
  toolName?: string // 使用するツール名
}

/** AI接続設定全体 */
export interface AISettings {
  mode: AIConnectionMode
  directApi: ProviderConfig
  mcp: MCPConfig
  customPrompt: string
}

/** 校正結果 */
export interface ProofreadResult {
  correctedText: string
  changes: Array<{
    original: string
    corrected: string
    position: number
    reason?: string
  }>
}

/** AI Connector インターフェース */
export interface AIConnector {
  proofread(ocrText: string, imageBase64: string): Promise<ProofreadResult>
  testConnection(): Promise<boolean>
}

/** デフォルトのプロバイダモデル */
export const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-haiku-4-20250414'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  google: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.0-flash-preview', 'gemini-3.0-pro-preview'],
  groq: ['llama-3.3-70b-versatile', 'gemma2-9b-it'],
  custom: [],
}

/** デフォルトのAPIエンドポイント */
export const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  custom: '',
}

/** デフォルト校正プロンプト */
export const DEFAULT_PROOFREAD_PROMPT = `あなたはOCR校正の専門家です。以下のOCRテキストを元画像と比較し、誤認識を修正してください。

重要な注意事項:
- 旧字体（舊字體）は現代字体に変換しないでください。原文の字体をそのまま保持してください。
- 明らかな誤認識のみを修正してください。
- 句読点や記号の誤認識も修正してください。
- 修正後のテキストのみを出力してください。説明は不要です。`

/** デフォルト設定 */
export const DEFAULT_AI_SETTINGS: AISettings = {
  mode: 'direct',
  directApi: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
  },
  mcp: {
    serverUrl: '',
  },
  customPrompt: DEFAULT_PROOFREAD_PROMPT,
}
