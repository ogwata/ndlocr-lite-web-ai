import { useRef, useEffect, useState, useCallback } from 'react'
import type { TextBlock, BoundingBox, PageBlock } from '../../types/ocr'

interface ImageViewerProps {
  imageDataUrl: string
  textBlocks: TextBlock[]
  selectedBlock: TextBlock | null
  onBlockSelect: (block: TextBlock) => void
  onRegionSelect?: (bbox: BoundingBox) => void
  selectedRegion?: BoundingBox | null
  pageBlocks?: PageBlock[]
  selectedPageBlock?: PageBlock | null
  onPageBlockSelect?: (block: PageBlock) => void
  pageIndex?: number
  totalPages?: number
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_STEP = 0.15
const FIT_ZOOM = -1 // sentinel for "fit to container"

type InteractionMode = 'pan' | 'select'

export function ImageViewer({
  imageDataUrl,
  textBlocks,
  selectedBlock,
  onBlockSelect,
  onRegionSelect,
  selectedRegion,
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

  // Zoom: FIT_ZOOM means "fit to container", otherwise explicit scale
  const [zoom, setZoom] = useState<number>(FIT_ZOOM)

  // Pan offset (pixels)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  // Interaction mode: pan (drag to move) or select (drag to select region)
  const [mode, setMode] = useState<InteractionMode>('pan')

  // Drag state
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  // Compute effective zoom
  const getEffectiveZoom = useCallback(() => {
    if (zoom !== FIT_ZOOM) return zoom
    if (!containerRef.current || naturalSize.width === 0) return 1
    const container = containerRef.current
    const scaleW = container.clientWidth / naturalSize.width
    const scaleH = container.clientHeight / naturalSize.height
    return Math.min(scaleW, scaleH, 1) // never upscale beyond 100%
  }, [zoom, naturalSize])

  const effectiveZoom = getEffectiveZoom()

  // Reset on image change
  useEffect(() => {
    setZoom(FIT_ZOOM)
    setPanOffset({ x: 0, y: 0 })
  }, [imageDataUrl])

  // Track image size
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
    let observer: ResizeObserver | null = null
    if (img) {
      observer = new ResizeObserver(updateSize)
      observer.observe(img)
    }
    return () => {
      img?.removeEventListener('load', updateSize)
      window.removeEventListener('resize', updateSize)
      observer?.disconnect()
    }
  }, [imageDataUrl])

  const scaleX = naturalSize.width > 0 ? imgSize.width / naturalSize.width : 1
  const scaleY = naturalSize.height > 0 ? imgSize.height / naturalSize.height : 1

  const getRelativePos = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // Wheel zoom (Ctrl/Cmd + wheel, or just wheel)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom((prev) => {
      const current = prev === FIT_ZOOM ? getEffectiveZoom() : prev
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + delta))
    })
  }, [getEffectiveZoom])

  // Mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()

    if (mode === 'pan') {
      setIsPanning(true)
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }
    } else if (mode === 'select' && onRegionSelect) {
      const pos = getRelativePos(e)
      setDragStart(pos)
      setDragCurrent(pos)
    }
  }

  // Mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
    } else if (dragStart) {
      setDragCurrent(getRelativePos(e))
    }
  }

  // Mouse up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
      return
    }
    if (dragStart && dragCurrent && onRegionSelect) {
      const x1 = Math.min(dragStart.x, dragCurrent.x) / scaleX
      const y1 = Math.min(dragStart.y, dragCurrent.y) / scaleY
      const x2 = Math.max(dragStart.x, dragCurrent.x) / scaleX
      const y2 = Math.max(dragStart.y, dragCurrent.y) / scaleY
      const bbox: BoundingBox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
      const MIN_DRAG = 15
      if (bbox.width >= MIN_DRAG && bbox.height >= MIN_DRAG) {
        onRegionSelect(bbox)
      }
    }
    setDragStart(null)
    setDragCurrent(null)
  }

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => {
      const current = prev === FIT_ZOOM ? getEffectiveZoom() : prev
      return Math.min(MAX_ZOOM, current + ZOOM_STEP * 2)
    })
  }
  const handleZoomOut = () => {
    setZoom((prev) => {
      const current = prev === FIT_ZOOM ? getEffectiveZoom() : prev
      return Math.max(MIN_ZOOM, current - ZOOM_STEP * 2)
    })
  }
  const handleZoomReset = () => {
    setZoom(FIT_ZOOM)
    setPanOffset({ x: 0, y: 0 })
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

  const displayedWidth = naturalSize.width * effectiveZoom
  const displayedHeight = naturalSize.height * effectiveZoom
  const zoomPercent = Math.round(effectiveZoom * 100)
  const isFit = zoom === FIT_ZOOM
  const cursorStyle = mode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'

  return (
    <div className="image-viewer-wrap">
      {/* Zoom + mode controls */}
      <div className="zoom-controls">
        <button
          className="btn-zoom btn-zoom-reset"
          onClick={handleZoomReset}
          title="Fit to view"
          disabled={isFit && panOffset.x === 0 && panOffset.y === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </button>
        <span className="zoom-controls-sep" />
        <button className="btn-zoom" onClick={handleZoomOut} title="Zoom out (Ctrl+Scroll)">−</button>
        <span className="zoom-level">{zoomPercent}%</span>
        <button className="btn-zoom" onClick={handleZoomIn} title="Zoom in (Ctrl+Scroll)">+</button>
        <span className="zoom-controls-sep" />
        {/* Mode toggle */}
        <button
          className={`btn-zoom ${mode === 'pan' ? 'btn-zoom-active' : ''}`}
          onClick={() => setMode('pan')}
          title="Pan mode (drag to move)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8a6 6 0 0 0 12 0v-2a2 2 0 0 0-4 0" />
          </svg>
        </button>
        {onRegionSelect && (
          <button
            className={`btn-zoom ${mode === 'select' ? 'btn-zoom-active' : ''}`}
            onClick={() => setMode('select')}
            title="Select region mode"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
            </svg>
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
        style={{ cursor: cursorStyle, overflow: 'hidden' }}
      >
        <div
          className="image-viewer-transform"
          style={{
            width: displayedWidth,
            height: displayedHeight,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            transformOrigin: '0 0',
            position: 'relative',
            margin: 'auto',
          }}
        >
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt="OCR対象画像"
            className="viewer-image"
            draggable={false}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Text block overlays */}
          <div className="viewer-overlay" style={{ width: imgSize.width, height: imgSize.height }}>
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

            {/* Mouse drag selection */}
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

            {/* Confirmed region highlight */}
            {selectedRegion && !selectionRect && (
              <div
                className="region-selected-highlight"
                style={{
                  left: selectedRegion.x * scaleX,
                  top: selectedRegion.y * scaleY,
                  width: selectedRegion.width * scaleX,
                  height: selectedRegion.height * scaleY,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Page info + image size */}
      <div className="image-viewer-info">
        {totalPages != null && totalPages > 0 && (
          <span>page {(pageIndex ?? 0) + 1}/{totalPages}</span>
        )}
        {naturalSize.width > 0 && (
          <span>{naturalSize.width}×{naturalSize.height}px</span>
        )}
      </div>
    </div>
  )
}
