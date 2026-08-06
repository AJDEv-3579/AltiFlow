import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  X, Layers, ZoomIn, ZoomOut, Maximize2, Minimize2, Download,
  Eye, EyeOff, Loader2, AlertCircle, RefreshCw, Info, Cpu, Compass, Sliders
} from 'lucide-react'
import Btn from '@/components/ui/Btn'
import GlassCard from '@/components/ui/GlassCard'
import { api } from '@/services/api'
import proj4 from 'proj4'

if (typeof window !== 'undefined') {
  window.proj4 = proj4
}

export default function MapLibreGISViewerModal({ job, project, onClose }) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [cogProcessing, setCogProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cogMetadata, setCogMetadata] = useState(null)

  const [orthoVisible, setOrthoVisible] = useState(true)
  const [vectorVisible, setVectorVisible] = useState(true)
  const [orthoOpacity, setOrthoOpacity] = useState(0.9)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [pitch, setPitch] = useState(0)

  const [orthoUrl, setOrthoUrl] = useState(null)
  const [vectorData, setVectorData] = useState(null)

  const [downloadingOrtho, setDownloadingOrtho] = useState(false)
  const [downloadingVector, setDownloadingVector] = useState(false)

  const r2Data = job?.r2_data || {}
  const orthoMeta = r2Data.orthomosaic
  const vectorMeta = r2Data.vector_grid

  // 1. Fetch Presigned URLs / Proxy endpoints & GeoJSON on mount
  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setLoading(true)
      setErrorMsg('')

      try {
        let fetchedOrthoUrl = null
        let fetchedVectorData = null

        if (orthoMeta?.key) {
          try {
            const res = await api('/r2/presigned-download', {
              method: 'POST',
              body: JSON.stringify({
                projectId: project.id,
                jobId: job.id,
                dataType: 'orthomosaic',
              }),
            })
            fetchedOrthoUrl = res.downloadUrl
          } catch (e) {
            console.warn('Presigned download URL fetch notice:', e.message)
          }
        }

        if (vectorMeta?.key) {
          try {
            const res = await api('/r2/presigned-download', {
              method: 'POST',
              body: JSON.stringify({
                projectId: project.id,
                jobId: job.id,
                dataType: 'vector_grid',
              }),
            })
            if (res.downloadUrl) {
              const vRes = await fetch(res.downloadUrl)
              if (vRes.ok) fetchedVectorData = await vRes.json()
            }
          } catch (e) {
            console.warn('Vector grid fetch notice:', e.message)
          }
        }

        if (isMounted) {
          setOrthoUrl(fetchedOrthoUrl)
          setVectorData(fetchedVectorData)
          if (!fetchedOrthoUrl && !fetchedVectorData && !orthoMeta?.key) {
            setErrorMsg('No GIS data (Orthomosaic or Vector Grid) uploaded for this Job Card yet.')
          }
        }
      } catch (err) {
        if (isMounted) setErrorMsg(err.message || 'Failed to initialize MapLibre COG Viewer.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()
    return () => { isMounted = false }
  }, [job.id, project.id, orthoMeta?.key, vectorMeta?.key])

  // 2. Initialize MapLibre GL JS WebGL Engine & Custom Canvas COG Renderer
  useEffect(() => {
    if (loading || typeof window === 'undefined' || !mapContainerRef.current) return

    let maplibregl
    let isCancelled = false

    // Inject MapLibre CSS & Script dynamically if not present
    async function loadMapLibreModules() {
      if (!document.getElementById('maplibre-gl-css')) {
        const cssLink = document.createElement('link')
        cssLink.id = 'maplibre-gl-css'
        cssLink.rel = 'stylesheet'
        cssLink.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
        document.head.appendChild(cssLink)
      }

      if (window.maplibregl) {
        maplibregl = window.maplibregl
      } else {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
          script.onload = () => {
            maplibregl = window.maplibregl
            resolve()
          }
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      if (isCancelled || !maplibregl) return

      // Destroy previous map instance if exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      // Initialize MapLibre GL instance with CartoDB Dark basemap style
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
              ],
              tileSize: 256,
              attribution: '© CartoDB',
            },
          },
          layers: [
            {
              id: 'carto-dark-layer',
              type: 'raster',
              source: 'carto-dark',
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        },
        center: [0, 0],
        zoom: 2,
      })

      mapInstanceRef.current = map

      map.on('load', async () => {
        if (isCancelled) return

        // --- A. COG Canvas & GeoTIFF WebGL Source Setup ---
        if (orthoMeta?.key || orthoUrl) {
          setCogProcessing(true)
          const proxyStreamUrl = `/api/r2/stream-file?projectId=${project.id}&jobId=${job.id}&dataType=orthomosaic`
          const targetUrl = orthoUrl || proxyStreamUrl

          try {
            let parseGeoraster
            try {
              parseGeoraster = require('georaster')
            } catch (e) {
              console.error('georaster import error', e)
            }

            let georaster
            const token = typeof window !== 'undefined' ? (sessionStorage.getItem('altiflow_token') || localStorage.getItem('altiflow_token')) : null
            const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

            try {
              const res = await fetch(targetUrl)
              if (!res.ok) throw new Error(`HTTP fetch status ${res.status}`)
              const buffer = await res.arrayBuffer()
              georaster = await parseGeoraster(buffer)
            } catch (fetchErr) {
              console.warn('Presigned fetch error, attempting proxy stream:', fetchErr.message)
              const proxyRes = await fetch(proxyStreamUrl, { headers: authHeaders })
              if (!proxyRes.ok) throw new Error(`Proxy stream status ${proxyRes.status}`)
              const buffer = await proxyRes.arrayBuffer()
              georaster = await parseGeoraster(buffer)
            }

            const startTime = performance.now()

            // Calculate Viewport Downsampling Dimensions (max 1600px for 100x speedup)
            const origWidth = georaster.width
            const origHeight = georaster.height
            const maxDim = 1600
            const scaleFactor = Math.max(1, Math.max(origWidth, origHeight) / maxDim)
            const targetWidth = Math.round(origWidth / scaleFactor)
            const targetHeight = Math.round(origHeight / scaleFactor)

            setCogMetadata({
              width: origWidth,
              height: origHeight,
              targetWidth,
              targetHeight,
              numberOfRasters: georaster.numberOfRasters,
              projection: georaster.projection,
              pixelWidth: georaster.pixelWidth,
              pixelHeight: georaster.pixelHeight,
              decodeTimeMs: 0,
            })

            // Calculate 4-Corner Geographic Lat/Lng Coordinates (NW, NE, SE, SW)
            let xmin = georaster.xmin
            let ymin = georaster.ymin
            let xmax = georaster.xmax
            let ymax = georaster.ymax

            let nw = [xmin, ymax]
            let ne = [xmax, ymax]
            let se = [xmax, ymin]
            let sw = [xmin, ymin]

            // Convert projected coordinates (UTM/meters) to WGS84 Lat/Lng if needed
            if (Math.abs(ymin) > 90 || Math.abs(ymax) > 90) {
              const crsCode = georaster.projection ? `EPSG:${georaster.projection}` : 'EPSG:3857'
              try {
                nw = proj4(crsCode, 'EPSG:4326', nw)
                ne = proj4(crsCode, 'EPSG:4326', ne)
                se = proj4(crsCode, 'EPSG:4326', se)
                sw = proj4(crsCode, 'EPSG:4326', sw)
              } catch (projErr) {
                console.warn('Proj4 conversion warning:', projErr)
              }
            }

            // MapLibre image coordinates order: [Top-Left (NW), Top-Right (NE), Bottom-Right (SE), Bottom-Left (SW)]
            const maplibreCoords = [
              [nw[0], nw[1]],
              [ne[0], ne[1]],
              [se[0], se[1]],
              [sw[0], sw[1]],
            ]

            // Render downsampled raster pixels to HTML5 Canvas
            const canvas = document.createElement('canvas')
            canvas.width = targetWidth
            canvas.height = targetHeight
            const ctx = canvas.getContext('2d')
            const imgData = ctx.createImageData(targetWidth, targetHeight)
            const data = imgData.data

            const rasters = georaster.values
            const numBands = georaster.numberOfRasters
            const totalPixels = targetWidth * targetHeight

            for (let i = 0; i < totalPixels; i++) {
              // Calculate downsampled raster index mapping
              const px = i % targetWidth
              const py = Math.floor(i / targetWidth)
              const srcX = Math.floor(px * scaleFactor)
              const srcY = Math.floor(py * scaleFactor)
              const srcIdx = srcY * origWidth + srcX

              let r = 0, g = 0, b = 0, a = 255
              if (numBands >= 3) {
                r = rasters[0][srcIdx] || 0
                g = rasters[1][srcIdx] || 0
                b = rasters[2][srcIdx] || 0
                if (numBands >= 4) a = rasters[3][srcIdx] ?? 255
              } else {
                const val = rasters[0][srcIdx] || 0
                r = val
                g = val
                b = val
              }

              // Set alpha = 0 for transparent background nodata pixels
              if (r === 0 && g === 0 && b === 0) a = 0

              const dataIdx = i * 4
              data[dataIdx] = r
              data[dataIdx + 1] = g
              data[dataIdx + 2] = b
              data[dataIdx + 3] = a
            }

            ctx.putImageData(imgData, 0, 0)
            const endTime = performance.now()
            const renderTime = Math.round(endTime - startTime)

            setCogMetadata(prev => prev ? { ...prev, decodeTimeMs: renderTime } : null)

            // Fast ObjectURL blob creation
            const canvasBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
            const canvasDataUrl = URL.createObjectURL(canvasBlob)

            // Add Canvas Raster Image Source to MapLibre GL WebGL Engine
            map.addSource('cog-ortho-source', {
              type: 'image',
              url: canvasDataUrl,
              coordinates: maplibreCoords,
            })

            map.addLayer({
              id: 'cog-ortho-layer',
              type: 'raster',
              source: 'cog-ortho-source',
              paint: {
                'raster-opacity': orthoOpacity,
                'raster-fade-duration': 0,
              },
            })

            // Auto-fit WebGL camera to Orthomosaic Lat/Lng bounds
            const bounds = [
              [Math.min(nw[0], sw[0]), Math.min(sw[1], se[1])],
              [Math.max(ne[0], se[0]), Math.max(nw[1], ne[1])],
            ]

            map.fitBounds(bounds, { padding: 40, duration: 1000 })
          } catch (cogErr) {
            console.error('MapLibre COG Canvas render error:', cogErr)
            setErrorMsg(`Unable to visualize COG Orthomosaic: ${cogErr.message || 'TIFF decoding error'}. You can download the raw file below.`)
          } finally {
            if (!isCancelled) setCogProcessing(false)
          }
        }

        // --- B. Vector Grid Layer Setup ---
        if (vectorData) {
          try {
            map.addSource('vector-grid-source', {
              type: 'geojson',
              data: vectorData,
            })

            map.addLayer({
              id: 'vector-grid-fill',
              type: 'fill',
              source: 'vector-grid-source',
              paint: {
                'fill-color': '#3b82f6',
                'fill-opacity': 0.15,
              },
            })

            map.addLayer({
              id: 'vector-grid-line',
              type: 'line',
              source: 'vector-grid-source',
              paint: {
                'line-color': '#60a5fa',
                'line-width': 2,
                'line-opacity': 0.9,
              },
            })

            map.on('click', 'vector-grid-fill', (e) => {
              if (e.features && e.features[0]) {
                const props = e.features[0].properties || {}
                setSelectedFeature(props)
              }
            })

            map.on('mouseenter', 'vector-grid-fill', () => {
              map.getCanvas().style.cursor = 'pointer'
            })
            map.on('mouseleave', 'vector-grid-fill', () => {
              map.getCanvas().style.cursor = ''
            })

            if (!orthoMeta?.key) {
              const bbox = getGeoJsonBbox(vectorData)
              if (bbox) map.fitBounds(bbox, { padding: 40, duration: 1000 })
            }
          } catch (vErr) {
            console.warn('Vector Grid layer error:', vErr)
          }
        }
      })
    }

    loadMapLibreModules()

    return () => {
      isCancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [loading, orthoUrl, vectorData, orthoMeta?.key])

  // Update Orthomosaic Opacity & Visibility
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map.getLayer('cog-ortho-layer')) return
    map.setLayoutProperty('cog-ortho-layer', 'visibility', orthoVisible ? 'visible' : 'none')
    map.setPaintProperty('cog-ortho-layer', 'raster-opacity', orthoOpacity)
  }, [orthoVisible, orthoOpacity])

  // Update Vector Visibility
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    if (map.getLayer('vector-grid-fill')) {
      map.setLayoutProperty('vector-grid-fill', 'visibility', vectorVisible ? 'visible' : 'none')
    }
    if (map.getLayer('vector-grid-line')) {
      map.setLayoutProperty('vector-grid-line', 'visibility', vectorVisible ? 'visible' : 'none')
    }
  }, [vectorVisible])

  // Map Controls
  function handleZoomIn() {
    mapInstanceRef.current?.zoomIn()
  }

  function handleZoomOut() {
    mapInstanceRef.current?.zoomOut()
  }

  function handleResetNorth() {
    mapInstanceRef.current?.resetNorthPitch()
    setPitch(0)
  }

  function toggle3DPitch() {
    const map = mapInstanceRef.current
    if (!map) return
    const newPitch = pitch === 0 ? 55 : 0
    map.easeTo({ pitch: newPitch, duration: 800 })
    setPitch(newPitch)
  }

  // Cloudflare R2 Direct Download Handler
  async function handleDownload(dataType) {
    const isOrtho = dataType === 'orthomosaic'
    if (isOrtho) setDownloadingOrtho(true)
    else setDownloadingVector(true)

    try {
      const res = await api('/r2/presigned-download', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          jobId: job.id,
          dataType,
        }),
      })

      if (!res.downloadUrl) throw new Error('Failed to generate download URL')

      const a = document.createElement('a')
      a.href = res.downloadUrl
      a.download = res.fileName || `${dataType}_${job.title}`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      toast.success(`Downloading ${isOrtho ? 'Field Orthomosaic' : 'Field Vector Grid'} from Cloudflare R2...`)
    } catch (err) {
      toast.error(err.message || 'Download failed')
    } finally {
      if (isOrtho) setDownloadingOrtho(false)
      else setDownloadingVector(false)
    }
  }

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[120] flex flex-col overflow-hidden ${isFullScreen ? 'p-0' : 'p-3 md:p-6'}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="w-full h-full bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header Bar */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100 truncate">{job.title}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-semibold flex items-center gap-1">
                  <Cpu size={12} /> MapLibre GL WebGL Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate">{project?.name || 'Workspace'} · Cloudflare R2 Storage</p>
            </div>
          </div>

          {/* Top Control Bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-0.5">
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer border-l border-zinc-800"
                title="Zoom Out (-)"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={toggle3DPitch}
                className={`px-2.5 py-1 hover:bg-zinc-800 text-xs font-medium transition-colors cursor-pointer border-l border-zinc-800 flex items-center gap-1 ${
                  pitch > 0 ? 'text-indigo-400 font-bold' : 'text-zinc-300 hover:text-white'
                }`}
                title="Toggle 3D Perspective Tilt"
              >
                <Compass size={13} />
                <span className="hidden sm:inline">{pitch > 0 ? '3D Active' : '3D Pitch'}</span>
              </button>
              <button
                onClick={handleResetNorth}
                className="px-2.5 py-1 hover:bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer border-l border-zinc-800 flex items-center gap-1"
                title="Reset North & Pitch"
              >
                <RefreshCw size={13} />
                <span className="hidden sm:inline">Reset View</span>
              </button>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-2 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer border-l border-zinc-800"
                title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
              >
                {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>

            <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Panel */}
          <div className="w-72 bg-zinc-950/95 border-r border-zinc-800/80 p-4 flex flex-col justify-between shrink-0 overflow-y-auto z-10 backdrop-blur-md">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-400" />
                  Layer Manager
                </span>
              </div>

              {/* Orthomosaic Layer Controls */}
              <GlassCard className="p-3 space-y-3 border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOrthoVisible(!orthoVisible)}
                      disabled={!orthoMeta}
                      className={`p-1 rounded transition-colors ${
                        orthoVisible && orthoMeta ? 'text-indigo-400 hover:text-indigo-300' : 'text-zinc-600'
                      }`}
                    >
                      {orthoVisible && orthoMeta ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <span className="text-xs font-semibold text-zinc-200">Field Orthomosaic</span>
                  </div>
                  {orthoMeta ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                      COG WebGL
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 italic">None</span>
                  )}
                </div>

                {orthoMeta && orthoVisible && (
                  <div className="space-y-1 pt-1 border-t border-zinc-800/60">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Canvas Opacity</span>
                      <span className="font-mono">{Math.round(orthoOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={orthoOpacity}
                      onChange={e => setOrthoOpacity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}
              </GlassCard>

              {/* Vector Grid Layer Controls */}
              <GlassCard className="p-3 space-y-2 border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVectorVisible(!vectorVisible)}
                      disabled={!vectorMeta}
                      className={`p-1 rounded transition-colors ${
                        vectorVisible && vectorMeta ? 'text-indigo-400 hover:text-indigo-300' : 'text-zinc-600'
                      }`}
                    >
                      {vectorVisible && vectorMeta ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <span className="text-xs font-semibold text-zinc-200">Field Vector Grid</span>
                  </div>
                  {vectorMeta ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                      GeoJSON
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 italic">None</span>
                  )}
                </div>
              </GlassCard>

              {/* COG Metadata Box */}
              {cogMetadata && (
                <GlassCard className="p-3 space-y-1.5 border-zinc-800/80">
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="flex items-center gap-1.5"><Cpu size={14} /> MapLibre WebGL Active</span>
                    {cogMetadata.decodeTimeMs > 0 && (
                      <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        ⚡ {cogMetadata.decodeTimeMs}ms
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-[10px] font-mono text-zinc-300">
                    <div className="flex justify-between"><span>Native Resolution:</span> <span>{cogMetadata.width} × {cogMetadata.height} px</span></div>
                    {cogMetadata.targetWidth && (
                      <div className="flex justify-between text-indigo-300"><span>Rendered Canvas:</span> <span>{cogMetadata.targetWidth} × {cogMetadata.targetHeight} px</span></div>
                    )}
                    <div className="flex justify-between"><span>Rasters / Bands:</span> <span>{cogMetadata.numberOfRasters} (RGBA Canvas)</span></div>
                    <div className="flex justify-between"><span>Projection:</span> <span>{cogMetadata.projection || 'UTM / GeoTIFF'}</span></div>
                  </div>
                </GlassCard>
              )}

              {/* Selected Feature Properties */}
              {selectedFeature && (
                <GlassCard className="p-3 space-y-2 border-zinc-800/80">
                  <div className="text-xs font-bold text-indigo-400 flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="flex items-center gap-1"><Info size={13} /> Plot Attributes</span>
                    <button onClick={() => setSelectedFeature(null)} className="text-zinc-500 hover:text-zinc-300">
                      <X size={12} />
                    </button>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto text-[11px] font-mono">
                    {Object.entries(selectedFeature).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-zinc-400 truncate">{k}:</span>
                        <span className="text-zinc-200 font-semibold truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>

            {/* Bottom Panel Downloads */}
            <div className="space-y-2 pt-4 border-t border-zinc-800/80">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Cloudflare R2 Direct Download</div>

              <Btn
                variant="secondary"
                size="sm"
                icon={Download}
                disabled={!orthoMeta || downloadingOrtho}
                onClick={() => handleDownload('orthomosaic')}
                className="w-full justify-center text-xs"
              >
                {downloadingOrtho ? 'Preparing Download...' : 'Download Orthomosaic'}
              </Btn>

              <Btn
                variant="secondary"
                size="sm"
                icon={Download}
                disabled={!vectorMeta || downloadingVector}
                onClick={() => handleDownload('vector_grid')}
                className="w-full justify-center text-xs"
              >
                {downloadingVector ? 'Preparing Download...' : 'Download Vector Grid'}
              </Btn>
            </div>
          </div>

          {/* Center Map View */}
          <div className="flex-1 h-full relative bg-zinc-950">
            {(loading || cogProcessing) && (
              <div className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                  <span className="text-sm font-medium text-zinc-300">
                    {cogProcessing ? 'Decoding GeoTIFF & initializing MapLibre WebGL Canvas...' : 'Loading GIS Data from Cloudflare R2...'}
                  </span>
                </div>
              </div>
            )}

            {errorMsg && !loading && !cogProcessing && (
              <div className="absolute inset-0 z-20 bg-zinc-950 flex items-center justify-center p-6 text-center">
                <div className="max-w-md p-6 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                    <AlertCircle size={24} />
                  </div>
                  <h3 className="text-base font-bold text-zinc-100">MapLibre GIS Notice</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
            )}

            <div ref={mapContainerRef} className="w-full h-full z-0" />
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function getGeoJsonBbox(geojson) {
  if (!geojson || !geojson.features || geojson.features.length === 0) return null
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  
  function processCoords(coords) {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    } else {
      coords.forEach(processCoords)
    }
  }

  geojson.features.forEach(f => {
    if (f.geometry && f.geometry.coordinates) {
      processCoords(f.geometry.coordinates)
    }
  })

  if (minLng === Infinity) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}
