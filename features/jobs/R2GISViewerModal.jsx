import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  X, Layers, ZoomIn, ZoomOut, Maximize2, Minimize2, Download,
  Eye, EyeOff, Loader2, AlertCircle, RefreshCw, Info, Cpu, Sliders
} from 'lucide-react'
import Btn from '@/components/ui/Btn'
import GlassCard from '@/components/ui/GlassCard'
import { api } from '@/services/api'

export default function R2GISViewerModal({ job, project, onClose }) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const orthoLayerRef = useRef(null)
  const vectorLayerRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [cogMetadata, setCogMetadata] = useState(null)

  const [orthoVisible, setOrthoVisible] = useState(true)
  const [vectorVisible, setVectorVisible] = useState(true)
  const [orthoOpacity, setOrthoOpacity] = useState(1.0)
  const [vectorOpacity, setVectorOpacity] = useState(0.85)

  const [isFullScreen, setIsFullScreen] = useState(false)
  const [selectedFeatureProps, setSelectedFeatureProps] = useState(null)

  const [orthoUrl, setOrthoUrl] = useState(null)
  const [vectorData, setVectorData] = useState(null)

  const [downloadingOrtho, setDownloadingOrtho] = useState(false)
  const [downloadingVector, setDownloadingVector] = useState(false)

  const r2Data = job?.r2_data || {}
  const orthoMeta = r2Data.orthomosaic
  const vectorMeta = r2Data.vector_grid

  // 1. Fetch presigned download URLs & Vector GeoJSON data
  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setLoading(true)
      setErrorMsg('')

      try {
        if (orthoMeta?.key) {
          try {
            const data = await api('/r2/presigned-download', {
              method: 'POST',
              body: JSON.stringify({
                projectId: project.id,
                jobId: job.id,
                dataType: 'orthomosaic',
              }),
            })
            if (isMounted && data.downloadUrl) {
              setOrthoUrl(data.downloadUrl)
            }
          } catch (err) {
            console.warn('Presigned download fetch notice:', err.message)
            if (isMounted) {
              setOrthoUrl(`/api/r2/stream-file?projectId=${project.id}&jobId=${job.id}&dataType=orthomosaic`)
            }
          }
        }

        if (vectorMeta?.key) {
          try {
            const data = await api('/r2/presigned-download', {
              method: 'POST',
              body: JSON.stringify({
                projectId: project.id,
                jobId: job.id,
                dataType: 'vector_grid',
              }),
            })
            if (data.downloadUrl) {
              const geoRes = await fetch(data.downloadUrl)
              if (geoRes.ok) {
                const geojson = await geoRes.json()
                if (isMounted) setVectorData(geojson)
              }
            }
          } catch (err) {
            console.warn('Vector download notice:', err.message)
          }
        }
      } catch (err) {
        if (isMounted) setErrorMsg(err.message || 'Failed to load GIS metadata.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()
    return () => { isMounted = false }
  }, [job, project, orthoMeta, vectorMeta])

  // 2. Initialize OpenLayers v10 WebGL Map Engine
  useEffect(() => {
    if (!mapContainerRef.current || typeof window === 'undefined') return

    let mapInstance
    let isCancelled = false

    async function initMap() {
      try {
        if (!document.getElementById('ol-css')) {
          const css = document.createElement('link')
          css.id = 'ol-css'
          css.rel = 'stylesheet'
          css.href = 'https://cdn.jsdelivr.net/npm/ol@v10.2.1/ol.css'
          document.head.appendChild(css)
        }

        const [
          { default: Map },
          { default: View },
          { default: TileLayer },
          { default: OSM }
        ] = await Promise.all([
          import('ol/Map'),
          import('ol/View'),
          import('ol/layer/Tile'),
          import('ol/source/OSM'),
        ])

        if (isCancelled) return

        const osmSource = new OSM()
        const baseLayer = new TileLayer({
          source: osmSource,
          properties: { name: 'basemap' },
        })

        const view = new View({
          center: [0, 0],
          zoom: 2,
          smoothResolution: true,
          constrainResolution: false,
        })

        mapInstance = new Map({
          target: mapContainerRef.current,
          layers: [baseLayer],
          view: view,
        })

        mapInstanceRef.current = mapInstance

        // Interactive Vector Click Inspector
        mapInstance.on('click', (evt) => {
          let foundProps = null
          mapInstance.forEachFeatureAtPixel(evt.pixel, (feature) => {
            foundProps = feature.getProperties()
            return true
          })
          if (foundProps) {
            delete foundProps.geometry
            setSelectedFeatureProps(foundProps)
          }
        })
      } catch (err) {
        console.error('OpenLayers initialization error:', err.message)
      }
    }

    initMap()

    return () => {
      isCancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(null)
        mapInstanceRef.current = null
      }
    }
  }, [])

  // 3. Load & Render Cloudflare R2 Presigned GeoTIFF Stream via OpenLayers WebGL
  useEffect(() => {
    if (!mapInstanceRef.current || (!orthoUrl && !orthoMeta?.key)) return

    let isCancelled = false

    async function loadGeoTIFF() {
      const map = mapInstanceRef.current

      if (orthoLayerRef.current) {
        try {
          const oldSource = orthoLayerRef.current.getSource()
          map.removeLayer(orthoLayerRef.current)
          if (oldSource && typeof oldSource.dispose === 'function') {
            oldSource.dispose()
          }
        } catch (e) {
          console.warn('Layer cleanup notice:', e.message)
        }
        orthoLayerRef.current = null
      }

      const streamUrl = orthoUrl || `/api/r2/stream-file?projectId=${project.id}&jobId=${job.id}&dataType=orthomosaic`

      try {
        const [
          { default: GeoTIFF },
          { default: WebGLTileLayer },
          { default: View }
        ] = await Promise.all([
          import('ol/source/GeoTIFF'),
          import('ol/layer/WebGLTile'),
          import('ol/View'),
        ])

        if (isCancelled) return

        const tiffSource = new GeoTIFF({
          sources: [{ url: streamUrl }],
          normalize: true,
          convertToRGB: true,
        })

        const orthoLayer = new WebGLTileLayer({
          source: tiffSource,
          opacity: orthoOpacity,
          visible: orthoVisible,
          transition: 0,
          properties: { name: 'orthomosaic' },
        })

        orthoLayerRef.current = orthoLayer
        map.addLayer(orthoLayer)

        const viewOptions = await tiffSource.getView()
        if (isCancelled) return

        const extent = viewOptions.extent

        const newView = new View({
          projection: viewOptions.projection,
          center: viewOptions.center || [0, 0],
          zoom: viewOptions.zoom || 14,
          smoothResolution: true,
          constrainResolution: false,
        })

        map.setView(newView)

        if (extent) {
          newView.fit(extent, { padding: [40, 40, 40, 40], duration: 800 })
        }

        setCogMetadata({
          fileName: orthoMeta?.fileName || 'Field Orthomosaic',
          projection: viewOptions.projection?.getCode?.() || 'GeoTIFF Native CRS',
          extent: extent,
        })
      } catch (err) {
        console.error('GeoTIFF WebGL render error:', err.message)
      }
    }

    loadGeoTIFF()
    return () => { isCancelled = true }
  }, [orthoUrl, job, project, orthoMeta])

  // 4. Render Vector Grid (.geojson)
  useEffect(() => {
    if (!vectorData || !mapInstanceRef.current) return

    let isCancelled = false

    async function loadVector() {
      try {
        const [
          { default: VectorSource },
          { default: VectorLayer },
          { default: GeoJSON },
          { Style, Stroke, Fill }
        ] = await Promise.all([
          import('ol/source/Vector'),
          import('ol/layer/Vector'),
          import('ol/format/GeoJSON'),
          import('ol/style'),
        ])

        if (isCancelled) return

        const map = mapInstanceRef.current

        if (vectorLayerRef.current) {
          map.removeLayer(vectorLayerRef.current)
          vectorLayerRef.current = null
        }

        const vectorSource = new VectorSource({
          features: new GeoJSON().readFeatures(vectorData, {
            dataProjection: 'EPSG:4326',
            featureProjection: map.getView().getProjection(),
          }),
        })

        const vectorLayer = new VectorLayer({
          source: vectorSource,
          style: new Style({
            stroke: new Stroke({ color: '#3b82f6', width: 2 }),
            fill: new Fill({ color: '#3b82f633' }),
          }),
          opacity: vectorOpacity,
          visible: vectorVisible,
          properties: { name: 'vector-grid' },
        })

        vectorLayerRef.current = vectorLayer
        map.addLayer(vectorLayer)
      } catch (err) {
        console.error('Vector render error:', err.message)
      }
    }

    loadVector()
    return () => { isCancelled = true }
  }, [vectorData])

  // React to Opacity & Visibility
  useEffect(() => {
    if (orthoLayerRef.current) {
      orthoLayerRef.current.setOpacity(orthoOpacity)
      orthoLayerRef.current.setVisible(orthoVisible)
    }
  }, [orthoOpacity, orthoVisible])

  useEffect(() => {
    if (vectorLayerRef.current) {
      vectorLayerRef.current.setOpacity(vectorOpacity)
      vectorLayerRef.current.setVisible(vectorVisible)
    }
  }, [vectorOpacity, vectorVisible])

  const handleDownload = async (type) => {
    const isOrtho = type === 'orthomosaic'
    if (isOrtho) setDownloadingOrtho(true)
    else setDownloadingVector(true)

    try {
      const data = await api('/r2/presigned-download', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          jobId: job.id,
          dataType: type,
        }),
      })

      if (data.downloadUrl) {
        const link = document.createElement('a')
        link.href = data.downloadUrl
        link.download = data.fileName || `${type}.data`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success(`Started downloading ${isOrtho ? 'Orthomosaic' : 'Vector Grid'}`)
      }
    } catch (err) {
      toast.error(err.message || 'Download failed')
    } finally {
      if (isOrtho) setDownloadingOrtho(false)
      else setDownloadingVector(false)
    }
  }

  const handleFitExtent = () => {
    const map = mapInstanceRef.current
    if (!map) return

    if (orthoLayerRef.current) {
      const source = orthoLayerRef.current.getSource()
      if (source?.getView) {
        source.getView().then(viewOptions => {
          if (viewOptions.extent) {
            map.getView().fit(viewOptions.extent, { padding: [40, 40, 40, 40], duration: 800 })
          }
        })
      }
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md ${isFullScreen ? 'p-0' : ''}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full bg-zinc-950 border border-zinc-800 flex flex-col overflow-hidden shadow-2xl ${
          isFullScreen ? 'h-screen w-screen rounded-none' : 'max-w-6xl h-[88vh] rounded-2xl'
        }`}
      >
        {/* Header Bar */}
        <div className="h-14 border-b border-zinc-800 px-5 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Layers size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">{job.title}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-semibold">
                  OpenLayers v10 WebGL Engine
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">
                Field Job ID: {job.job_code || job.id} · {project.name || 'Client Project'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Btn
              variant="outline"
              size="sm"
              onClick={handleFitExtent}
              className="text-xs font-bold text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
            >
              <Maximize2 size={13} className="mr-1" /> Fit Bounds
            </Btn>

            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition"
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Layer Panel */}
          <aside className="w-80 bg-zinc-950/95 border-r border-zinc-800 p-4 flex flex-col justify-between shrink-0 overflow-y-auto z-10">
            <div className="space-y-5">
              {/* Raster Layer Controls */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOrthoVisible(!orthoVisible)}
                      disabled={!orthoMeta}
                      className={`p-1 rounded transition ${orthoVisible && orthoMeta ? 'text-emerald-400' : 'text-zinc-600'}`}
                    >
                      {orthoVisible && orthoMeta ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <span className="text-xs font-semibold text-zinc-200">Field Orthomosaic</span>
                  </div>
                  {orthoMeta ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      Cloudflare R2
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 italic">Not Uploaded</span>
                  )}
                </div>

                {orthoMeta && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                      <span>Opacity</span>
                      <span>{Math.round(orthoOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={orthoOpacity}
                      onChange={(e) => setOrthoOpacity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />

                    <Btn
                      variant="outline"
                      size="xs"
                      onClick={() => handleDownload('orthomosaic')}
                      loading={downloadingOrtho}
                      className="w-full mt-2 text-xs border-zinc-700 text-zinc-300 hover:text-white"
                    >
                      <Download size={12} className="mr-1.5" /> Download GeoTIFF
                    </Btn>
                  </div>
                )}
              </div>

              {/* Vector Layer Controls */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVectorVisible(!vectorVisible)}
                      disabled={!vectorMeta}
                      className={`p-1 rounded transition ${vectorVisible && vectorMeta ? 'text-indigo-400' : 'text-zinc-600'}`}
                    >
                      {vectorVisible && vectorMeta ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <span className="text-xs font-semibold text-zinc-200">Field Vector Grid</span>
                  </div>
                  {vectorMeta ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                      GeoJSON
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 italic">Not Uploaded</span>
                  )}
                </div>

                {vectorMeta && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                      <span>Opacity</span>
                      <span>{Math.round(vectorOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={vectorOpacity}
                      onChange={(e) => setVectorOpacity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />

                    <Btn
                      variant="outline"
                      size="xs"
                      onClick={() => handleDownload('vector_grid')}
                      loading={downloadingVector}
                      className="w-full mt-2 text-xs border-zinc-700 text-zinc-300 hover:text-white"
                    >
                      <Download size={12} className="mr-1.5" /> Download GeoJSON
                    </Btn>
                  </div>
                )}
              </div>

              {/* Raster Metadata Inspector */}
              {cogMetadata && (
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 space-y-1.5 font-mono text-[11px]">
                  <div className="text-xs font-bold text-emerald-400 border-b border-zinc-800 pb-1 flex items-center justify-between">
                    <span>Dataset Info</span>
                    <span className="text-emerald-300 text-[10px]">OpenLayers</span>
                  </div>
                  <div className="flex justify-between text-zinc-400"><span>Target:</span> <span className="text-zinc-200 truncate max-w-[140px]">{cogMetadata.fileName}</span></div>
                  <div className="flex justify-between text-zinc-400"><span>Projection:</span> <span className="text-zinc-200 truncate max-w-[120px]">{cogMetadata.projection}</span></div>
                </div>
              )}
            </div>

            {/* Selected Vector Feature Inspector */}
            {selectedFeatureProps && (
              <div className="bg-zinc-900 border border-indigo-500/30 rounded-xl p-3 space-y-2 mt-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1">
                  <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                    <Info size={13} /> Selected Plot Attributes
                  </span>
                  <button onClick={() => setSelectedFeatureProps(null)} className="text-zinc-500 hover:text-zinc-300">
                    <X size={12} />
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono">
                  {Object.entries(selectedFeatureProps).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-zinc-400 truncate">{k}:</span>
                      <span className="text-zinc-200 font-semibold truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Map Viewport */}
          <main className="flex-1 h-full relative bg-zinc-950">
            {loading && (
              <div className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center text-xs text-emerald-400 font-mono">
                <Loader2 size={18} className="animate-spin mr-2" /> Initializing OpenLayers v10 WebGL Stream...
              </div>
            )}

            <div ref={mapContainerRef} className="w-full h-full z-0" />
          </main>
        </div>
      </motion.div>
    </div>
  )
}
