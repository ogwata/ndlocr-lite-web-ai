# NDLOCR-Lite Web AI

**AI校正機能付き ブラウザ完結型 日本語OCRツール**

国立国会図書館（NDL）が開発・公開している **[NDLOCR-Lite](https://github.com/ndl-lab/ndlocr-lite)** をベースに、橋本雄太氏（国立歴史民俗博物館）による **[ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web)** をフォークして開発したWebアプリケーションです。OCR結果に対してAI（Claude、GPT、Gemini等）による校正機能を付加し、歴史的文書のデジタル化精度を向上させることを目指しています。

## 特徴

- **ブラウザ完結** — 画像・OCR結果を外部サーバーに送信しません。すべての処理がブラウザ内で完結します
- **AI校正** — ボタン一つでAIがOCRテキストを元画像と比較し、誤認識を修正。差分をインラインハイライトで表示し、個別にaccept/rejectできます
- **複数AIプロバイダ対応** — Anthropic (Claude) / OpenAI (GPT) / Google (Gemini) / Groq / カスタムエンドポイント / MCP Server
- **並列表示UI** — 元画像とOCR結果テキストを左右に配置し、対照しやすいレイアウト（リサイズ可能）
- **高精度レイアウト認識** — DEIMv2モデルによりテキスト行の矩形領域を自動検出
- **カスケード文字認識** — 行の文字数に応じて3種類のPARSeqモデルを使い分け、精度を最適化
- **PDF・複数形式対応** — JPG / PNG / TIFF / HEIC / PDF（複数ページ対応）
- **バッチ処理** — 複数の画像ファイルやフォルダをまとめて処理
- **結果のキャッシュ** — IndexedDBにモデルと処理結果（最新100件）を保存し、再利用可能
- **画像ビューア** — Fit-to-view自動フィット、ズーム（+/−ボタン）、パン/選択モード切替、OCR検出矩形のオーバーレイ表示
- **領域選択OCR** — 画像上でマウスドラッグして選択した領域だけをOCR → そのままAI校正も可能
- **画像前処理** — 明るさ・コントラスト・シャープネス調整、二値化、ノイズ除去、傾き補正、ページ分割
- **ダークモード** — OS設定に追従するライト/ダークテーマ切替
- **縦書き表示** — テキストエリアの縦書き表示モード切替
- **検索・置換** — テキストエリア内の検索・置換機能（Ctrl+F）
- **多言語UI** — 日本語・英語・中国語（繁体/簡体）・韓国語の5言語対応
- **TEI/hOCRエクスポート** — OCR結果をTEI P5 XML（人文学研究向け）やhOCR形式でダウンロード可能

## 使い方

### 基本操作

1. ブラウザでアプリにアクセス
2. 初回起動時にONNXモデル（計約146MB）を自動ダウンロード・IndexedDBにキャッシュ
3. 画像（JPG/PNG/TIFF/HEIC）またはPDFをドラッグ＆ドロップするか、クリックして選択
4. 「OCRを開始」ボタンをクリック（領域をドラッグして選択すると、その部分だけOCRも可能）
5. OCR結果が右パネルに表示される。テキストは編集可能
6. 「コピー」「ダウンロード」ボタンで現在表示中のテキストを出力

### AI校正の使い方

1. 設定（⚙️）からAI接続を構成（プロバイダ選択、APIキー入力、モデル選択）
2. 「接続テスト」で接続を確認（ヘッダーに「AI接続済み」と表示される）
3. OCR結果画面で「AI校正」ボタンをクリック（接続テスト未実施の場合は警告が表示されます）
4. AIが元画像とOCRテキストを比較し、修正テキストを返却
5. 差分がインラインハイライトで表示（削除＝赤背景、追加＝緑背景）
6. 各修正箇所の ✓（適用）/ ✗（却下）ボタンで個別に判断（ctrl+zで取り消し可能）、または「全て適用」「全て却下」

> **旧字体の保持:** デフォルトの校正プロンプトでは、歴史的文書の旧字体を現代字体に変換しないよう指示しています。プロンプトは設定パネルからカスタマイズ可能です。

### AI接続モード

| モード | 説明 |
|--------|------|
| **Direct API** | ブラウザから直接AI APIを呼び出す。APIキーはWeb Crypto APIで暗号化してlocalStorageに保存。サーバーには送信されません |
| **MCP Server** | MCPサーバーのURL（Streamable HTTPエンドポイント）を指定して接続。ユーザーが自前のMCPサーバー経由で任意のAIに接続可能 |

## 対応環境

- **推奨環境:** デスクトップPC / タブレット横向き（画面幅768px以上）
- **対応ブラウザ:** Chrome / Firefox / Safari / Edge の最新版（WebAssembly + IndexedDB + Web Worker対応が必須）
- **モバイル:** スマートフォンは積極的にサポートしていません。768px未満の画面ではPC環境での利用を推奨するメッセージが表示されます

## 対応ファイル形式

| 形式 | 説明 |
|------|------|
| JPEG / PNG | 一般的な画像ファイル |
| TIFF | マルチページ対応 |
| HEIC | iPhoneの写真形式 |
| PDF | 複数ページ対応（各ページを2倍スケールでレンダリング） |

## 技術情報

### 使用モデル（NDLOCR-Lite より）

| モデル | ファイル | サイズ | 用途 |
|--------|---------|--------|------|
| DEIMv2 | `deim-s-1024x1024.onnx` | 38MB | レイアウト検出（テキスト行の矩形認識） |
| PARSeq-30 | `parseq-ndl-30.onnx` | 34MB | 文字認識（≤30文字行） |
| PARSeq-50 | `parseq-ndl-50.onnx` | 35MB | 文字認識（≤50文字行） |
| PARSeq-100 | `parseq-ndl-100.onnx` | 39MB | 文字認識（≤100文字行） |

### 技術スタック

| 要素 | 技術 |
|------|------|
| フレームワーク | Vite + React 19 + TypeScript |
| OCRランタイム | onnxruntime-web 1.20.0（WASM CPUバックエンド） |
| PDF処理 | pdfjs-dist 4.9.0 |
| OCR処理 | Web Worker（UIをブロックしない非同期処理） |
| AI校正 | Direct API（Anthropic/OpenAI/Google/Groq）/ MCP Server |
| 差分表示 | diff-match-patch |
| APIキー保存 | Web Crypto API（AES-GCM暗号化） |
| モデル/結果キャッシュ | IndexedDB |
| デプロイ | Netlify（COOP/COEPヘッダー対応） |

### OCR処理フロー

```
入力ファイル（JPG/PNG/TIFF/HEIC/PDF）
  → imageLoader / pdfLoader → ImageData
  → Web Worker
    1. DEIMv2 レイアウト検出 → テキスト行の矩形 + 文字数カテゴリ
    2. カスケード文字認識（PARSeq × 3モデル）
       charCountCategory=3 → PARSeq-30
       charCountCategory=2 → PARSeq-50
       その他               → PARSeq-100
    3. 読み順ソート（縦書き右→左）
  → メインスレッド → 結果表示 + IndexedDB保存
```

## ローカル開発

```bash
# 依存関係インストール
npm install

# モデルファイルを配置（ndlocr-lite から取得）
cp /path/to/ndlocr-lite/src/model/deim-s-1024x1024.onnx        public/models/
cp /path/to/ndlocr-lite/src/model/parseq-ndl-16x256-30-*.onnx  public/models/parseq-ndl-30.onnx
cp /path/to/ndlocr-lite/src/model/parseq-ndl-16x384-50-*.onnx  public/models/parseq-ndl-50.onnx
cp /path/to/ndlocr-lite/src/model/parseq-ndl-16x768-100-*.onnx public/models/parseq-ndl-100.onnx

# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# ユニットテスト実行
npm run test

# MCPテスト用モックサーバー起動（localhost:3456）
npm run mcp-server
```

> **Note:** COOP/COEPヘッダーが必要なため、`npm run dev` で起動した開発サーバー（`localhost:5173`）で動作確認してください。`file://` プロトコルでは動作しません。

## ドキュメント

| ドキュメント | 内容 | 対象読者 |
|---|---|---|
| [README.md](README.md)（本ファイル） | 機能概要、使い方、対応環境、ライセンス | すべてのユーザー |
| [CLAUDE.md](CLAUDE.md) | 技術仕様（ディレクトリ構成、UI設計仕様、コーディング規約、制約・ルール） | 開発者・コントリビューター |
| [開発計画書](docs/NDLOCR-Lite-Web-AI-開発計画書.md) | プロジェクトの背景、技術選定の理由、UI設計思想、デプロイ先比較、開発フェーズ | プロジェクト経緯を知りたい方 |

## 注意事項

- 初回起動時に約 **146MB** のONNXモデルをダウンロードします（2回目以降はキャッシュから読み込み）
- 処理時間はハードウェア性能に依存します（GPU加速なしのCPU推論のため、1枚あたり数十秒かかる場合があります）
- AI校正機能を使用するには、各AIプロバイダのAPIキーが必要です
- APIキーはブラウザ内で暗号化して保存されます。サーバーには一切送信されません

## ライセンス

本プロジェクト（NDLOCR-Lite Web AI）の追加コードには **MIT License** を適用します。

| 対象 | ライセンス | 権利者 |
|------|-----------|--------|
| NDLOCR-Lite（OCRモデル・アルゴリズム） | CC BY 4.0 | 国立国会図書館 |
| ndlocrlite-web（Web移植コード） | LICENSEファイルに準拠 | 橋本雄太氏 |
| NDLOCR-Lite Web AI（本プロジェクトの追加コード） | MIT License | 小形 |
| UI拡張機能（ダークモード、画像前処理、多言語UI等） | MIT License | [宮川創](https://researchmap.jp/SoMiyagawa)（筑波大学） |

## 帰属・クレジット

本ツールは以下のプロジェクトの派生物です。

- **NDLOCR-Lite:** [ndl-lab/ndlocr-lite](https://github.com/ndl-lab/ndlocr-lite)（国立国会図書館）
- **ndlocrlite-web:** [yuta1984/ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web)（橋本雄太氏）
- **DEIMv2:** [ShihuaHuang95/DEIM](https://github.com/ShihuaHuang95/DEIM)
- **PARSeq:** [baudm/parseq](https://github.com/baudm/parseq)
- **文字セット（NDLmoji.yaml）:** 国立国会図書館
- **ndlocr-lite-web-ai-deluxe:** [somiyagawa/ndlocr-lite-web-ai-deluxe](https://github.com/somiyagawa/ndlocr-lite-web-ai-deluxe)（宮川創氏） — 画像前処理、ダークモード、多言語UI、縦書き表示等

## 変更履歴

### v0.3.6（2026-03-23）

- 画像ビューアの操作モデル刷新（Fit-to-view自動フィット、パン/選択モード切替、ドラッグによる画像移動）
- fix: Fit-to-viewでコンテナサイズ未確定時に画像が表示されない問題を修正
- fix: 画像前処理適用後に画像が真っ黒になる問題を修正
- fix: シャープネス適用時に画像が真っ黒になる問題を修正（カーネル計算を修正）
- fix: 前処理スライダーの操作性を改善（処理中もスライダー操作可能に、コールバック安定化）
- fix: シャープネス効果を強化（unsharp mask方式、strength 0-3倍）

### v0.3.1（2026-03-23）

- 処理履歴パネルの改善（処理時間・文字数・ページ数の表示、空状態UI、サムネイルバッジ）

### v0.3.0（2026-03-23）

- TEI P5 XML / hOCR形式でのOCR結果エクスポート機能を追加
- `requestIdleCallback`によるWorker遅延初期化で初期描画を高速化
- pdfjs-distの動的importによるPDF遅延読み込み
- Vite `manualChunks`によるチャンク分割（pdfjs-dist / heic2any / diff-match-patch）

### v0.2.0（2026-03-23）

- 画像前処理パネル（明るさ・コントラスト・シャープネス・二値化・ノイズ除去・傾き補正・ページ分割）
- ダークモード（OS設定追従）
- 多言語UI拡張（韓国語・中国語繁体/簡体を追加、計5言語対応）
- 縦書き表示モード
- テキスト検索・置換機能
- UIデザイン刷新
- NDLMoji.yamlのfetch過多を修正（Workerごとに1回のみ）
- LICENSEをデュアルライセンス形式（CC BY 4.0 + MIT）に更新

### v0.1.0（2026-03-22）

- 初回リリース
- ブラウザ完結型OCR（ONNX Runtime Web / WASM）
- AI校正機能（Direct API / MCP Server対応）
- 左右分割ビュー（画像＋テキスト並列表示）
- 差分表示（個別accept/reject、ctrl+zアンドゥ）
- PDF・TIFF・HEIC対応、バッチ処理
- 領域選択OCR
- マルチスレッド文字認識
- XY-Cutアルゴリズムによる読み順推定（段組み対応）
- Netlifyデプロイ（COOP/COEPヘッダー対応）
