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
- **差分表示:** diff-match-patch（追加予定）
- **状態管理:** React Context + useReducer
- **デプロイ:** Netlify（COOP/COEPヘッダー必須）

## コマンド

```bash
npm install          # 依存パッケージのインストール
npm run dev          # 開発サーバー起動（localhost:5173）
npm run build        # プロダクションビルド
npm run preview      # ビルド結果のプレビュー
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
│   └── ...                   # OCR処理、UIコンポーネント等
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

- [x] Phase 1: フォーク＆セットアップ ← **現在ここ**
- [ ] Phase 2: レイアウト改修（画像＋テキスト並列表示）
- [ ] Phase 3: AI接続機能（Direct API / MCP Server）
- [ ] Phase 4: AI校正機能
- [ ] Phase 5: 仕上げ・デプロイ

## 重要な制約・ルール

### COOP/COEPヘッダー
ONNX Runtime WASMがSharedArrayBufferを使うため、以下のレスポンスヘッダーが必須。netlify.toml で設定済み。
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

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

### ライセンス
- 本プロジェクトの追加コード: MIT License
- OCRモデル・アルゴリズム: NDLOCR-Lite（国立国会図書館、CC BY 4.0）
- Web移植ベースコード: ndlocrlite-web（橋本雄太氏）
- 帰属表示を必ず維持すること

## 上流リポジトリ

- **origin:** ogwata/ndlocr-lite-web-ai（本リポジトリ）
- **upstream:** yuta1984/ndlocrlite-web（フォーク元）
- **元のOCRエンジン:** ndl-lab/ndlocr-lite
