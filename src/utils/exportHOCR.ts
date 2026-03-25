/**
 * hOCR エクスポート
 *
 * OCR結果をhOCR (HTML-based OCR) フォーマットで出力する。
 * hOCR仕様: https://kba.github.io/hocr-spec/1.2/
 *
 * 構造:
 *   <div class="ocr_page"> → ページ全体
 *     <span class="ocr_line"> → 各テキスト行（bbox付き）
 *       テキスト内容
 *     </span>
 */

import type { OCRResult } from '../types/ocr'

/** HTMLの特殊文字をエスケープ */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * bboxプロパティ文字列を生成（hOCR仕様: "bbox x0 y0 x1 y1"）
 */
function bboxStr(x: number, y: number, w: number, h: number): string {
  return `bbox ${Math.round(x)} ${Math.round(y)} ${Math.round(x + w)} ${Math.round(y + h)}`
}

/**
 * OCRResult → hOCR HTML 文字列
 */
export function generateHOCR(result: OCRResult): string {
  const sortedBlocks = [...result.textBlocks].sort((a, b) => a.readingOrder - b.readingOrder)
  const fileName = escapeHtml(result.fileName)
  const now = new Date().toISOString()

  // ページ全体のbbox（全ブロックの外接矩形）
  let pageX0 = Infinity, pageY0 = Infinity, pageX1 = 0, pageY1 = 0
  for (const block of sortedBlocks) {
    pageX0 = Math.min(pageX0, block.x)
    pageY0 = Math.min(pageY0, block.y)
    pageX1 = Math.max(pageX1, block.x + block.width)
    pageY1 = Math.max(pageY1, block.y + block.height)
  }
  if (sortedBlocks.length === 0) {
    pageX0 = pageY0 = 0
    pageX1 = pageY1 = 0
  }

  const pageBbox = `bbox ${Math.round(pageX0)} ${Math.round(pageY0)} ${Math.round(pageX1)} ${Math.round(pageY1)}`

  // 各テキスト行を <span class="ocr_line"> として出力
  const lines = sortedBlocks.map((block, i) => {
    const bb = bboxStr(block.x, block.y, block.width, block.height)
    const conf = block.confidence !== undefined ? `; x_wconf ${Math.round(block.confidence * 100)}` : ''
    const text = escapeHtml(block.text)
    return `      <span class="ocr_line" id="line_${i + 1}" title="${bb}${conf}">${text}</span>`
  }).join('\n')

  const html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" lang="ja">
<head>
  <title>hOCR output: ${fileName}</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <meta name="ocr-system" content="NDLOCR-Lite Web AI"/>
  <meta name="ocr-capabilities" content="ocr_page ocr_line"/>
  <meta name="dc.date" content="${now}"/>
  <meta name="dc.source" content="${fileName}"/>
</head>
<body>
  <div class="ocr_page" id="page_1" title="image &quot;${fileName}&quot;; ${pageBbox}">
${lines}
  </div>
</body>
</html>
`
  return html
}

/**
 * hOCR HTMLをファイルとしてダウンロード
 */
export function downloadHOCR(result: OCRResult): void {
  const html = generateHOCR(result)
  const baseName = result.fileName.replace(/\.[^/.]+$/, '')
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}_ocr.hocr`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 複数のOCR結果をまとめた単一のhOCRファイルとしてダウンロード
 */
export function downloadBatchHOCR(results: OCRResult[], batchName?: string): void {
  const now = new Date().toISOString()
  let lineIdCounter = 1

  const pages = results.map((result, pageIdx) => {
    const sortedBlocks = [...result.textBlocks].sort((a, b) => a.readingOrder - b.readingOrder)
    const fileName = escapeHtml(result.fileName)

    let pageX0 = Infinity, pageY0 = Infinity, pageX1 = 0, pageY1 = 0
    for (const block of sortedBlocks) {
      pageX0 = Math.min(pageX0, block.x)
      pageY0 = Math.min(pageY0, block.y)
      pageX1 = Math.max(pageX1, block.x + block.width)
      pageY1 = Math.max(pageY1, block.y + block.height)
    }
    if (sortedBlocks.length === 0) {
      pageX0 = pageY0 = 0
      pageX1 = pageY1 = 0
    }

    const pageBbox = `bbox ${Math.round(pageX0)} ${Math.round(pageY0)} ${Math.round(pageX1)} ${Math.round(pageY1)}`

    const lines = sortedBlocks.map(block => {
      const bb = bboxStr(block.x, block.y, block.width, block.height)
      const conf = block.confidence !== undefined ? `; x_wconf ${Math.round(block.confidence * 100)}` : ''
      const text = escapeHtml(block.text)
      const id = lineIdCounter++
      return `      <span class="ocr_line" id="line_${id}" title="${bb}${conf}">${text}</span>`
    }).join('\n')

    return `  <div class="ocr_page" id="page_${pageIdx + 1}" title="image &quot;${fileName}&quot;; ${pageBbox}">
${lines}
  </div>`
  }).join('\n')

  const html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" lang="ja">
<head>
  <title>hOCR batch output</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <meta name="ocr-system" content="NDLOCR-Lite Web AI"/>
  <meta name="ocr-capabilities" content="ocr_page ocr_line"/>
  <meta name="dc.date" content="${now}"/>
</head>
<body>
${pages}
</body>
</html>
`
  const name = batchName ?? 'batch'
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}_ocr.hocr`
  a.click()
  URL.revokeObjectURL(url)
}
