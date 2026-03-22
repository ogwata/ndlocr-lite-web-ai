import { useRef, useEffect, useState, useCallback } from 'react'
import type { TextBlock, BoundingBox, PageBlock } from '../../types/ocr'

interface ImageViewerProps {
  imageDataUrl: string
  textBlocks: TextBlock[]
  selectedBlock: TextBlock | null
  onBlockSelect: (block: TextBlock) => void
  onRegionSelect?: (blocks: TextBlock[], bbox: BoundingBox) => void
  pageBlocks?: PageBlock[]
  selectedPageBlock?: PageBlock | null
  onPageBlockSelect?: (block: PageBlock) => void
  pageIndex?: number
  totalPages?: number
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const ZOOM_STEP = 0.15

export function ImageViewer({
  imageDataUrl,
  textBlocks,
  selectedBlock,
  onBlockSelect,
  onRegionSelect,
  pageBlocks,
  selectedPageBlock,
  onPageBlockSelect,
  pageIndex,
  totalPages,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 })
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)

  // ズーム状態
  const [zoom, setZoom] = useState(1)

  // 画像が変わったらズームをリセット
  useEffect(() => {
    setZoom(1)
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
      containerRef.current.scrollLeft = 0
    }
  }, [imageDataUrl])

  useEffect(() => {
    const updateSize = () => {
      if (imgRef.current) {
        setImgSize({ width: imgRef.current.clientWidth, height: imgRef.current.clientHeight })
        setNaturalSize({ width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight })
      }
    }
    const img = imgRef.current
    if (img) {
      img.addEventListener('load', updateSize)
      updateSize()
    }
    window.addEventListener('resize', updateSize)
    return () => {
      img?.removeEventListener('load', updateSize)
      window.removeEventListener('resize', updateSize)
    }
  }, [imageDataUrl])

  const scaleX = naturalSize.width > 0 ? imgSize.width / naturalSize.width : 1
  const scaleY = naturalSize.height > 0 ? imgSize.height / naturalSize.height : 1

  const getRelativePos = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // ホイールズーム（Ctrl/Cmd+ホイールのみ。通常ホイールはスクロールに使う）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return // 通常スクロールはブラウザに任せる
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)))
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onRegionSelect) return
    if (e.button !== 0) return
    const pos = getRelativePos(e)
    setDragStart(pos)
    setDragCurrent(pos)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return
    setDragCurrent(getRelativePos(e))
  }

  const handleMouseUp = () => {
    if (!dragStart || !dragCurrent || !onRegionSelect) {
      setDragStart(null)
      setDragCurrent(null)
      return
    }
    // スクリーン座標 → 元画像座標に変換
    const x1 = Math.min(dragStart.x, dragCurrent.x) / scaleX
    const y1 = Math.min(dragStart.y, dragCurrent.y) / scaleY
    const x2 = Math.max(dragStart.x, dragCurrent.x) / scaleX
    const y2 = Math.max(dragStart.y, dragCurrent.y) / scaleY

    const bbox: BoundingBox = {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    }

    const selected = textBlocks.filter((b) => {
      return b.x < x2 && b.x + b.width > x1 && b.y < y2 && b.y + b.height > y1
    })

    const MIN_DRAG = 15
    if (bbox.width >= MIN_DRAG && bbox.height >= MIN_DRAG) {
      onRegionSelect(selected, bbox)
    }

    setDragStart(null)
    setDragCurrent(null)
  }

  const handleZoomIn = () => setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP * 2))
  const handleZoomOut = () => setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP * 2))
  const handleZoomReset = () => {
    setZoom(1)
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
      containerRef.current.scrollLeft = 0
    }
  }

  const selectionRect =
    dragStart && dragCurrent
      ? {
          left: Math.min(dragStart.x, dragCurrent.x),
          top: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragCurrent.x - dragStart.x),
          height: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null

  const isZoomed = zoom !== 1

  return (
    <div className="image-viewer-wrap">
      {/* ズームコントロール */}
      <div className="zoom-controls">
        <button className="btn-zoom" onClick={handleZoomOut} title="Zoom out">−</button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button className="btn-zoom" onClick={handleZoomIn} title="Zoom in">+</button>
        {isZoomed && (
          <button className="btn-zoom btn-zoom-reset" onClick={handleZoomReset} title="Reset">
            Reset
          </button>
        )}
      </div>

      <div
        className="image-viewer"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="image-viewer-transform"
          style={{
            width: `${zoom * 100}%`,
          }}
        >
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt="OCR対象画像"
            className="viewer-image"
            draggable={false}
          />

          {/* テキスト領域オーバーレイ */}
          <div className="viewer-overlay" style={{ width: imgSize.width, height: imgSize.height }}>
            {/* PageBlock オーバーレイ */}
            {pageBlocks?.map((block, i) => (
              <div
                key={`pb-${i}`}
                className={`page-block-box ${selectedPageBlock === block ? 'selected' : ''}`}
                style={{
                  left: block.x * scaleX,
                  top: block.y * scaleY,
                  width: block.width * scaleX,
                  height: block.height * scaleY,
                }}
                onClick={(e) => { e.stopPropagation(); onPageBlockSelect?.(block) }}
                title={`Block ${i + 1}`}
              />
            ))}

            {textBlocks.map((block, i) => (
              <div
                key={i}
                className={`region-box ${selectedBlock === block ? 'selected' : ''}`}
                style={{
                  left: block.x * scaleX,
                  top: block.y * scaleY,
                  width: block.width * scaleX,
                  height: block.height * scaleY,
                }}
                onClick={() => onBlockSelect(block)}
                title={block.text}
              />
            ))}

            {/* マウスドラッグ選択範囲 */}
            {selectionRect && (
              <div
                className="drag-selection"
                style={{
                  left: selectionRect.left,
                  top: selectionRect.top,
                  width: selectionRect.width,
                  height: selectionRect.height,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ページ番号と画像サイズ */}
      <div className="image-viewer-info">
        {totalPages != null && totalPages > 0 && (
          <span>page {(pageIndex ?? 0) + 1}/{totalPages}</span>
        )}
        {naturalSize.width > 0 && (
          <span>{naturalSize.width}x{naturalSize.height}px</span>
        )}
      </div>
    </div>
  )
}
