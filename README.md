# NDLOCR-Lite Web AI Deluxe

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
- **画像ビューア** — ズーム（+/−ボタン）+スクロールバーで自由に移動、OCR検出矩形のオーバーレイ表示
- **領域選択OCR** — 画像上でマウスドラッグして選択した領域だけをOCR → そのままAI校正も可能
- **日英対応** — 日本語・英語のUI切替

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

## 注意事項

- 初回起動時に約 **146MB** のONNXモデルをダウンロードします（2回目以降はキャッシュから読み込み）
- 処理時間はハードウェア性能に依存します（GPU加速なしのCPU推論のため、1枚あたり数十秒かかる場合があります）
- AI校正機能を使用するには、各AIプロバイダのAPIキーが必要です
- APIキーはブラウザ内で暗号化して保存されます。サーバーには一切送信されません

## ライセンス

本プロジェクト（NDLOCR-Lite Web AI Deluxe）の追加コードには **MIT License** を適用します。

| 対象 | ライセンス | 権利者 |
|------|-----------|--------|
| NDLOCR-Lite（OCRモデル・アルゴリズム） | CC BY 4.0 | 国立国会図書館 |
| ndlocrlite-web（Web移植コード） | LICENSEファイルに準拠 | 橋本雄太氏 |
| NDLOCR-Lite Web AI Deluxe（本プロジェクトの追加コード） | MIT License | 小形 |

## 帰属・クレジット

本ツールは以下のプロジェクトの派生物です。

- **NDLOCR-Lite:** [ndl-lab/ndlocr-lite](https://github.com/ndl-lab/ndlocr-lite)（国立国会図書館）
- **ndlocrlite-web:** [yuta1984/ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web)（橋本雄太氏）
- **DEIMv2:** [ShihuaHuang95/DEIM](https://github.com/ShihuaHuang95/DEIM)
- **PARSeq:** [baudm/parseq](https://github.com/baudm/parseq)
- **文字セット（NDLmoji.yaml）:** 国立国会図書館
