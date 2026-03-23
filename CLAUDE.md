# NDLOCR-Lite Web AI

## プロジェクト概要

NDLOCR-Lite Web AI は、国立国会図書館の NDLOCR-Lite をベースにした、ブラウザ完結型OCR Webアプリケーションである。yuta1984/ndlocrlite-web をフォークし、AI校正機能を追加する。

- ブラウザ内でONNX Runtime Web（WASM）によるOCR推論を実行
- サーバーに画像を送信しない完全クライアントサイド処理
- AI（Claude, GPT, Gemini等）によるOCR結果の校正機能を付加

詳細な開発計画は `docs/NDLOCR-Lite-Web-AI-開発計画書.md` を参照。

## 技術スタック

- **フレームワーク:** Vite + React 19 + TypeScript
- **OCRランタイム:** onnxruntime-web 1.20.0（WASM CPUバックエンド）
- **PDF処理:** pdfjs-dist 4.9.0
- **OCR処理:** Web Worker（非同期）
- **モデルキャッシュ:** IndexedDB
- **差分表示:** diff-match-patch
- **状態管理:** React Context + useReducer
- **デプロイ:** Netlify（COOP/COEPヘッダー必須）

## コマンド

```bash
npm install          # 依存パッケージのインストール
npm run dev          # 開発サーバー起動（localhost:5173）
npm run build        # プロダクションビルド
npm run preview      # ビルド結果のプレビュー
npm run test         # ユニットテスト実行（Vitest）
npm run test:watch   # テスト監視モード
npm run mcp-server   # MCPテスト用モックサーバー起動（localhost:3456）
```

## ディレクトリ構成

```
ndlocr-lite-web-ai/
├── public/
│   └── models/           # ONNXモデルファイル（約146MB合計）
│       ├── deim-s-1024x1024.onnx    # レイアウト検出（38MB）
│       ├── parseq-ndl-30.onnx       # 文字認識 ≤30文字（34MB）
│       ├── parseq-ndl-50.onnx       # 文字認識 ≤50文字（35MB）
│       └── parseq-ndl-100.onnx      # 文字認識 ≤100文字（39MB）
├── src/
│   ├── App.tsx               # メインアプリコンポーネント
│   ├── main.tsx              # エントリポイント
│   ├── ai/
│   │   ├── direct-api.ts          # Direct APIコネクタ（Anthropic/OpenAI/Google/Groq）
│   │   └── mcp-connector.ts       # MCP Serverコネクタ（Streamable HTTP）
│   ├── components/
│   │   ├── layout/
│   │   │   ├── SplitView.tsx      # リサイズ可能な左右分割パネル
│   │   │   ├── BottomToolbar.tsx  # ボトムバー（Upload + 処理時間表示）
│   │   │   └── Header.tsx         # ヘッダー（バージョンバッジ + AI接続ステータス）
│   │   ├── editor/
│   │   │   ├── TextEditor.tsx     # 編集可能テキストエリア + AI校正ボタン
│   │   │   └── DiffView.tsx       # 差分表示（accept/reject UI付き）
│   │   ├── viewer/ImageViewer.tsx # 画像表示（ズーム/スクロール + 領域選択 + ページ/サイズ情報）
│   │   ├── settings/SettingsModal.tsx # AI接続設定 + キャッシュ管理
│   │   └── ...                    # その他UIコンポーネント
│   ├── hooks/useAISettings.ts     # AI設定管理hook
│   ├── utils/crypto.ts            # APIキー暗号化（Web Crypto API）
│   ├── types/ai.ts                # AI関連の型定義
│   └── ...                   # OCR処理、hooks、utils等
├── docs/
│   └── NDLOCR-Lite-Web-AI-開発計画書.md
├── CLAUDE.md                 # このファイル
├── netlify.toml              # Netlifyデプロイ設定（COOP/COEPヘッダー）
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## OCR処理フロー

```
入力（JPG/PNG/PDF）
  → imageLoader / pdfLoader → ImageData
  → Web Worker
    1. DEIMv2 レイアウト検出 → テキスト行矩形 + 文字数カテゴリ
    2. カスケード文字認識（PARSeq × 3モデル）
       - charCountCategory=3 → PARSeq-30
       - charCountCategory=2 → PARSeq-50
       - その他             → PARSeq-100
    3. 読み順ソート（縦書き右→左）
  → メインスレッド → 結果表示 + IndexedDB保存
```

## 開発フェーズ（現在の状態）

- [x] Phase 1: フォーク＆セットアップ
- [x] Phase 2: レイアウト改修（SplitView、TextEditor、ズーム/パン）
- [x] Phase 3: AI接続機能（Direct API / MCP Server、設定パネル拡張）
- [x] Phase 4: AI校正機能（DiffView、個別accept/reject、ボトムツールバー）
- [x] Phase 5: 仕上げ・デプロイ（エラーハンドリング、レスポンシブ、デプロイ最適化）

## UI設計仕様

### メイン画面レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ [N] NDLOCR-Lite Web AI  v0.1.0          [AI connected] [Settings] │  ← ヘッダーバー
├───────────────────────────┬─────────────────────────────────────┤
│                           │  OCR result  [AI校正][コピー][ダウンロード]│
│   Original image          │                                     │
│                           │  第八章　職員、庁舎、財政、          │
│   ┌───┐ ┌───┐ ┌──┐       │  記念行事等                         │
│   │   │ │   │ │  │       │                                     │
│   │縦 │ │縦 │ │縦│       │  一、職員                            │
│   │書 │ │書 │ │書│       │  Ａ　司書職員の研修                  │
│   │テ │ │テ │ │テ│       │                                     │
│   │キ │ │キ │ │キ│       │  昭和二十六年度（第四回）研修に      │
│   │ス │ │ス │ │ス│       │  引続き、昭和二十七年度……           │
│   │ト │ │ト │ │ト│       │                                     │
│   └───┘ └───┘ └──┘       │  ██本年度も單位██ → 本年度も単位    │
│                           │   ↑赤背景(削除)    ↑緑背景(追加)    │
│   page 1/25  1024x1536px  │                                     │
├───────────────────────────┴─────────────────────────────────────┤
│ [Upload image/PDF]                OCR:2.3s  AI:1.1s  3corrections│  ← ボトムバー
└─────────────────────────────────────────────────────────────────┘
```

### 各パネルの仕様

**ヘッダーバー:**
- 左: アプリアイコン + アプリ名 + バージョンバッジ
- 右: AI接続ステータスバッジ（connected=緑 / disconnected=灰）+ Settingsボタン

**左パネル（ImageViewer）:**
- 元画像の表示（+/−ボタンとCtrl+ホイールでズーム、スクロールバーで移動）
- OCR検出されたテキスト行の矩形をオーバーレイ（青枠、半透明）
- 領域選択: マウスドラッグ → オレンジ枠ハイライト → 「選択領域のOCRを開始」ボタンで部分OCR
- 画像下部にページ番号（page N/M）と画像サイズ表示

**右パネル（TextEditor）:**
- OCR結果の編集可能テキストエリア
- フォント: monospace、サイズ: 13-14px、line-height: 1.9
- ビューポート高さの70-80%、overflow-y: auto でスクロール可能
- パネル上部にボタン群: 「AI校正」（紫グラデーション）「コピー」「ダウンロード」（現在表示中のテキストのみ対象）
- AI校正後の差分表示: 削除部分＝赤背景+取消線、追加部分＝緑背景のインライン表示
- 各修正箇所に✓（適用）/✗（却下）ボタン、ctrl+zでアンドゥ可能
- 「新しいファイルを処理」クリック時にOCR結果の破棄確認ダイアログを表示
- AI未接続（接続テスト未実施）時に「AI校正」ボタンを押すと警告ダイアログを表示

**SplitView:**
- 左右パネルのリサイズ可能スプリッタ（デフォルト50:50）

**ボトムツールバー:**
- 左: 「Upload image/PDF」ボタン（青アクセント）
- 右: OCR処理時間、AI校正時間、修正件数の表示

### 設定パネル（Settingsモーダル）

```
┌─────────────────────────────────────────┐
│ AI settings                              │
│ Configure AI connection for proofreading │
├─────────────────────────────────────────┤
│                                          │
│ Connection type                          │
│ ┌──────────────┐ ┌──────────────┐       │
│ │ ★Direct API  │ │  MCP server  │       │
│ └──────────────┘ └──────────────┘       │
│                                          │
│ Provider                                 │
│ ┌──────────────────────────────────┐    │
│ │ Anthropic (Claude)           ▼   │    │
│ └──────────────────────────────────┘    │
│                                          │
│ API key                                  │
│ ┌──────────────────────────────────┐    │
│ │ sk-ant-xxxx...xxxx               │    │
│ └──────────────────────────────────┘    │
│ ⓘ Stored locally. Never sent to server. │
│                                          │
│ Model                                    │
│ ┌──────────────────────────────────┐    │
│ │ claude-sonnet-4-20250514     ▼   │    │
│ └──────────────────────────────────┘    │
│                                          │
│ Proofreading prompt                      │
│ ┌──────────────────────────────────┐    │
│ │ You are an expert OCR proof-     │    │
│ │ reader for historical Japanese   │    │
│ │ documents. Compare the OCR text  │    │
│ │ with the original image and fix  │    │
│ │ recognition errors. Preserve     │    │
│ │ original orthography (旧字体).   │    │
│ │ Return only the corrected text.  │    │
│ └──────────────────────────────────┘    │
│                                          │
│ ── MCP configuration (when selected) ──  │
│                                          │
│ MCP server URL                           │
│ ┌──────────────────────────────────┐    │
│ │ https://mcp.example.com/sse      │    │
│ └──────────────────────────────────┘    │
│                                          │
│ Server name                              │
│ ┌──────────────────────────────────┐    │
│ │ my-ai-server                     │    │
│ └──────────────────────────────────┘    │
│                                          │
│          [Test connection]  [Save]       │
└─────────────────────────────────────────┘
```

### 設定パネルの仕様

**接続モード切替（タブ形式）:**
- Direct API（デフォルト選択）: ブラウザ→AI API直接呼び出し
- MCP Server: MCPサーバーURL指定で任意のAIに接続

**Direct APIモードの項目:**
- Provider選択: Anthropic (Claude) / OpenAI (GPT) / Google (Gemini) / Groq / Custom endpoint
- API key: password入力欄。localStorageにWeb Crypto APIで暗号化保存
- Model: プロバイダに応じたモデル一覧（ドロップダウン）
- Proofreading prompt: textarea。デフォルトで旧字体保存を指示する校正プロンプト

**MCP Serverモードの項目:**
- MCP server URL: SSEエンドポイントのURL
- Server name: 識別用の名前

**アクション:**
- Test connection: 接続テスト（成功/失敗をフィードバック）
- Save: 設定をlocalStorageに保存

### AI校正フロー

```
[AI校正ボタン] クリック
  → ローディング表示
  → 現在のOCRテキスト + 元画像(base64) を AI に送信
  → AI が画像とテキストを比較、修正テキストを返却
  → diff-match-patch で元テキストと修正テキストを比較
  → テキストエリア上に差分をインライン表示:
      削除部分 → 赤背景 + 取り消し線
      追加部分 → 緑背景
  → 各差分箇所に accept(✓) / reject(✗) ボタン表示
  → ctrl+z で判断を1つ前に戻す
  → 「選択を適用」で個別判断を反映、または「全て適用」「全て却下」
  → ボトムバーに修正件数・処理時間を表示
```

## 重要な制約・ルール

### COOP/COEPヘッダー

ONNX Runtime WASMがSharedArrayBufferを使うため、以下のレスポンスヘッダーが必須。netlify.toml で設定済み。

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### NDLMoji.yaml の読み込みキャッシュ

`/config/NDLMoji.yaml`（文字認識用の文字セット定義）は `src/worker/text-recognizer.ts` のモジュールレベルでキャッシュしている。同一Worker内では初回のみfetchし、複数の `TextRecognizer` インスタンス間で共有する。これはインスタンスごとにfetchしていた際に毎秒10回以上のポーリングが発生し、Netlifyの帯域を圧迫した問題への対処である。新たに `TextRecognizer` を利用するコードを追加する場合も、この仕組みを維持すること。

### コーディング規約

- 言語: TypeScript（strict mode）
- コンポーネント: React関数コンポーネント + Hooks
- スタイル: 既存のCSSファイルの規約に従う
- 新規コンポーネントは `src/` 配下に適切に配置する
- 日本語コメント可（UIテキストは日英両対応を維持）

### AI校正関連の設計方針

- AIへの接続は2モード: Direct API（ブラウザ→AI API直接）と MCP Server
- APIキーはlocalStorage + Web Crypto APIで暗号化保存。サーバーには送信しない
- 歴史的文書の旧字体を現代字体に変換しないこと（デフォルトプロンプトで明示）
- 差分表示: 削除＝赤背景、追加＝緑背景のインラインハイライト

### 対応環境・モバイル方針

- **主要ターゲット:** デスクトップPC / タブレット横向き（画面幅768px以上）
- **モバイル（スマートフォン）は積極的にサポートしない。** 理由は以下のとおり:
  - 左右並列表示（画像＋テキスト比較）がスマートフォンの画面幅（360〜430px）では成立しない
  - 146MBのモデルダウンロードがモバイル回線では負担が大きい
  - WASM CPU推論がモバイル端末では処理速度・バッテリー消費の面で厳しい
  - diff表示のaccept/rejectボタンがタッチ操作では正確に操作しにくい
- **モバイルアクセス時の対応:** 画面幅768px未満でアクセスした場合、「PC環境での利用を推奨」するメッセージを表示する。それでも使う場合は上下配置にフォールバックするが、これは最低限の対応であり最適化は行わない
- **対応ブラウザ:** Chrome / Firefox / Safari / Edge の最新版（WebAssembly + IndexedDB + Web Worker対応が必須）

### ライセンス

- 本プロジェクトの追加コード: MIT License
- OCRモデル・アルゴリズム: NDLOCR-Lite（国立国会図書館、CC BY 4.0）
- Web移植ベースコード: ndlocrlite-web（橋本雄太氏）
- 帰属表示を必ず維持すること

## 上流リポジトリ

- **origin:** ogwata/ndlocr-lite-web-ai（本リポジトリ）
- **upstream:** yuta1984/ndlocrlite-web（フォーク元）
- **元のOCRエンジン:** ndl-lab/ndlocr-lite
