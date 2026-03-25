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

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const FIT_ZOOM = -1

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
  const [zoom, setZoom] = useState<number>(FIT_ZOOM)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState<InteractionMode>('pan')
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [smooth, setSmooth] = useState(false)
  const [showTextOverlay, setShowTextOverlay] = useState(false)
  const [showConfidence, setShowConfidence] = useState(false)
  const [showReadingOrder, setShowReadingOrder] = useState(false)

  const panStartRef = useRef({ x: 0, y: 0 })
  const panOffsetRef = useRef({ x: 0, y: 0 })
  const smoothTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { panOffsetRef.current = panOffset }, [panOffset])

  // Container size tracking for fit-to-view calculation
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateContainerSize = () => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight })
    }
    updateContainerSize()
    const observer = new ResizeObserver(updateContainerSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Compute fit-to-container zoom
  const computeFitZoom = useCallback(() => {
    if (naturalSize.width === 0 || containerSize.width === 0 || containerSize.height === 0) return 1
    return Math.min(containerSize.width / naturalSize.width, containerSize.height / naturalSize.height, 1)
  }, [naturalSize, containerSize])

  const effectiveZoom = zoom === FIT_ZOOM ? computeFitZoom() : zoom

  // Reset on image change
  useEffect(() => {
    setZoom(FIT_ZOOM)
    setPanOffset({ x: 0, y: 0 })
    setSmooth(false)
  }, [imageDataUrl])

  // Track image natural size
  useEffect(() => {
    const updateSize = () => {
      if (imgRef.current) {
        setImgSize({ width: imgRef.current.clientWidth, height: imgRef.current.clientHeight })
        setNaturalSize({ width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight })
      }
    }
    const img = imgRef.current
    if (img) { img.addEventListener('load', updateSize); updateSize() }
    window.addEventListener('resize', updateSize)
    let obs: ResizeObserver | null = null
    if (img) { obs = new ResizeObserver(updateSize); obs.observe(img) }
    return () => { img?.removeEventListener('load', updateSize); window.removeEventListener('resize', updateSize); obs?.disconnect() }
  }, [imageDataUrl])

  // Spacebar held = temporary pan mode (only when image viewer area is focused, not in text inputs)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const activeMode: InteractionMode = spaceHeld ? 'pan' : mode

  const scaleX = naturalSize.width > 0 ? imgSize.width / naturalSize.width : 1
  const scaleY = naturalSize.height > 0 ? imgSize.height / naturalSize.height : 1

  const getRelativePos = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // Helper to set smooth transition with auto-clear
  const setSmoothTemporarily = (durationMs = 300) => {
    setSmooth(true)
    if (smoothTimerRef.current) clearTimeout(smoothTimerRef.current)
    smoothTimerRef.current = setTimeout(() => setSmooth(false), durationMs)
  }

  useEffect(() => {
    return () => { if (smoothTimerRef.current) clearTimeout(smoothTimerRef.current) }
  }, [])

  // Zoom towards a point (keep the point under cursor fixed)
  const zoomTowards = useCallback((clientX: number, clientY: number, newZoom: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mx = clientX - rect.left - rect.width / 2
    const my = clientY - rect.top - rect.height / 2
    const oldZoom = zoom === FIT_ZOOM ? computeFitZoom() : zoom
    const ratio = newZoom / oldZoom
    const newPan = {
      x: mx - ratio * (mx - panOffsetRef.current.x),
      y: my - ratio * (my - panOffsetRef.current.y),
    }
    setSmooth(false)
    setZoom(newZoom)
    setPanOffset(newPan)
  }, [zoom, computeFitZoom])

  // Wheel zoom (Ctrl/Cmd + wheel only, cursor-centered)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.ctrlKey
        ? 1 - e.deltaY * 0.01
        : 1 - e.deltaY * 0.003
      const oldZ = zoom === FIT_ZOOM ? computeFitZoom() : zoom
      const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZ * factor))
      zoomTowards(e.clientX, e.clientY, newZ)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [zoom, computeFitZoom, zoomTowards])

  // Double-click: zoom in 2x or reset
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const oldZ = zoom === FIT_ZOOM ? computeFitZoom() : zoom
    if (oldZ > computeFitZoom() * 1.1) {
      setSmoothTemporarily()
      setZoom(FIT_ZOOM)
      setPanOffset({ x: 0, y: 0 })
    } else {
      const newZ = Math.min(MAX_ZOOM, oldZ * 2)
      setSmoothTemporarily()
      zoomTowards(e.clientX, e.clientY, newZ)
    }
  }, [zoom, computeFitZoom, zoomTowards])

  // Mouse interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (activeMode === 'pan') {
      setIsPanning(true)
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }
    } else if (activeMode === 'select' && onRegionSelect) {
      const pos = getRelativePos(e)
      setDragStart(pos)
      setDragCurrent(pos)
    }
  }

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

  const handleMouseUp = () => {
    if (isPanning) { setIsPanning(false); return }
    if (dragStart && dragCurrent && onRegionSelect) {
      const x1 = Math.min(dragStart.x, dragCurrent.x) / scaleX
      const y1 = Math.min(dragStart.y, dragCurrent.y) / scaleY
      const x2 = Math.max(dragStart.x, dragCurrent.x) / scaleX
      const y2 = Math.max(dragStart.y, dragCurrent.y) / scaleY
      const bbox: BoundingBox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
      if (bbox.width >= 15 && bbox.height >= 15) onRegionSelect(bbox)
    }
    setDragStart(null)
    setDragCurrent(null)
  }

  // Zoom button handlers (center-based with smooth transition)
  const handleZoomIn = () => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const oldZ = zoom === FIT_ZOOM ? computeFitZoom() : zoom
    setSmoothTemporarily(250)
    zoomTowards(rect.left + rect.width / 2, rect.top + rect.height / 2, Math.min(MAX_ZOOM, oldZ * 1.4))
  }

  const handleZoomOut = () => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const oldZ = zoom === FIT_ZOOM ? computeFitZoom() : zoom
    setSmoothTemporarily(250)
    zoomTowards(rect.left + rect.width / 2, rect.top + rect.height / 2, Math.max(MIN_ZOOM, oldZ / 1.4))
  }

  const handleZoomReset = () => {
    setSmoothTemporarily()
    setZoom(FIT_ZOOM)
    setPanOffset({ x: 0, y: 0 })
  }

  const handleZoom100 = () => {
    setSmoothTemporarily()
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  // Derived state
  const selectionRect = dragStart && dragCurrent ? {
    left: Math.min(dragStart.x, dragCurrent.x),
    top: Math.min(dragStart.y, dragCurrent.y),
    width: Math.abs(dragCurrent.x - dragStart.x),
    height: Math.abs(dragCurrent.y - dragStart.y),
  } : null

  const displayedWidth = naturalSize.width * effectiveZoom
  const displayedHeight = naturalSize.height * effectiveZoom
  const zoomPercent = Math.round(effectiveZoom * 100)
  const isFit = zoom === FIT_ZOOM
  const cursorStyle = activeMode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'

  const transformStyle: React.CSSProperties = {
    width: displayedWidth,
    height: displayedHeight,
    transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
    transformOrigin: '0 0',
    position: 'relative',
    margin: 'auto',
    transition: smooth ? 'width 0.25s ease, height 0.25s ease, transform 0.25s ease' : 'none',
  }

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
        <button className="zoom-level" onClick={handleZoom100} title="Click for 100%">{zoomPercent}%</button>
        <button className="btn-zoom" onClick={handleZoomIn} title="Zoom in (Ctrl+Scroll)">+</button>
        <span className="zoom-controls-sep" />
        <button
          className={`btn-zoom ${activeMode === 'pan' ? 'btn-zoom-active' : ''}`}
          onClick={() => setMode('pan')}
          title="Pan mode — drag to move (hold Space)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8a6 6 0 0 0 12 0v-2a2 2 0 0 0-4 0" />
          </svg>
        </button>
        {onRegionSelect && (
          <button
            className={`btn-zoom ${activeMode === 'select' && !spaceHeld ? 'btn-zoom-active' : ''}`}
            onClick={() => setMode('select')}
            title="Select region — drag to select area for OCR"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
            </svg>
          </button>
        )}
        {textBlocks.length > 0 && (
          <>
            <span className="zoom-controls-sep" />
            <button
              className={`btn-zoom ${showTextOverlay ? 'btn-zoom-active' : ''}`}
              onClick={() => setShowTextOverlay(v => !v)}
              title="Text overlay"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
              </svg>
            </button>
            <button
              className={`btn-zoom ${showConfidence ? 'btn-zoom-active' : ''}`}
              onClick={() => setShowConfidence(v => !v)}
              title="Confidence heatmap"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15h18" /><path d="M3 9h18" />
              </svg>
            </button>
            <button
              className={`btn-zoom ${showReadingOrder ? 'btn-zoom-active' : ''}`}
              onClick={() => setShowReadingOrder(v => !v)}
              title="Reading order"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" /><path d="M18 13l-6 6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Image container */}
      <div
        className="image-viewer"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: cursorStyle, overflow: 'hidden' }}
      >
        <div className="image-viewer-transform" style={transformStyle}>
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt="OCR対象画像"
            className="viewer-image"
            draggable={false}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          <div className="viewer-overlay" style={{ width: imgSize.width, height: imgSize.height }}>
            {pageBlocks?.map((block, i) => (
              <div
                key={`pb-${i}`}
                className={`page-block-box ${selectedPageBlock === block ? 'selected' : ''}`}
                style={{
                  left: block.x * scaleX, top: block.y * scaleY,
                  width: block.width * scaleX, height: block.height * scaleY,
                }}
                onClick={(e) => { e.stopPropagation(); onPageBlockSelect?.(block) }}
                title={`Block ${i + 1}`}
              />
            ))}
            {textBlocks.map((block, i) => {
              const conf = block.confidence ?? 0.5
              const confidenceStyle = showConfidence ? {
                backgroundColor: `hsla(${Math.round(conf * 120)}, 85%, 50%, 0.5)`,
                border: `2px solid hsla(${Math.round(conf * 120)}, 85%, 45%, 0.8)`,
              } : undefined
              const titleText = block.text + (showConfidence ? ` (${Math.round(conf * 100)}%)` : '')
              const isVertical = block.height > block.width * 1.3
              return (
                <div
                  key={i}
                  className={`region-box ${selectedBlock === block ? 'selected' : ''} ${showTextOverlay ? 'region-box-text-overlay' : ''}`}
                  style={{
                    left: block.x * scaleX, top: block.y * scaleY,
                    width: block.width * scaleX, height: block.height * scaleY,
                    ...confidenceStyle,
                  }}
                  onClick={() => onBlockSelect(block)}
                  title={titleText}
                >
                  {showTextOverlay && (
                    <span className="region-text-label" style={{ writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb' }}>
                      {block.text}
                    </span>
                  )}
                  {showReadingOrder && (
                    <span className="region-reading-order">{block.readingOrder}</span>
                  )}
                </div>
              )
            })}
            {selectionRect && (
              <div className="drag-selection" style={{
                left: selectionRect.left, top: selectionRect.top,
                width: selectionRect.width, height: selectionRect.height,
              }} />
            )}
            {selectedRegion && !selectionRect && (
              <div className="region-selected-highlight" style={{
                left: selectedRegion.x * scaleX, top: selectedRegion.y * scaleY,
                width: selectedRegion.width * scaleX, height: selectedRegion.height * scaleY,
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Page info */}
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
