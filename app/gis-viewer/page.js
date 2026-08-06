'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Globe, Layers, Eye, EyeOff, ZoomIn, ZoomOut, Maximize2, Trash2,
  Plus, Sliders, Info, X, ChevronRight, ChevronDown, Check, Sparkles,
  MapPin, Compass, RefreshCw, Settings, Search, Filter, Tag
} from 'lucide-react'

export default function GISMultiLayerWorkspacePage() {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const layerMapRef = useRef(new Map()) // Stores active OpenLayers layer objects by layer ID
  const addedKeysRef = useRef(new Set()) // Prevents duplicate layer additions
  const processedJobIdRef = useRef(null) // Stores active OpenLayers layer objects by layer ID

  // Layer Stack State: Array of layer objects
  const [layers, setLayers] = useState([])
  const [activeTab, setActiveTab] = useState('layers') // 'layers' | 'inspector'

  // Available Field Jobs from Supabase
  const [availableJobs, setAvailableJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [showAddJobModal, setShowAddJobModal] = useState(false)

  // Add Layer Modal Filter & Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('All Stages')

  // Basemap State: 'google_hybrid' | 'osm' | 'carto_dark' | 'white'
  const [basemapType, setBasemapType] = useState('google_hybrid')
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)

  // Vector Settings Modal / Popover State
  const [activeSettingsLayerId, setActiveSettingsLayerId] = useState(null)

  // Selected Vector Feature Properties Inspector
  const [selectedFeatureProps, setSelectedFeatureProps] = useState(null)

  // Fetch available R2 jobs from database
  useEffect(() => {
    async function loadJobs() {
      setLoadingJobs(true)
      try {
        const res = await fetch('/api/test-gis/jobs')
        if (res.ok) {
          const data = await res.json()
          setAvailableJobs(data.jobs || [])
        }
      } catch (err) {
        console.warn('Jobs fetch notice:', err.message)
      } finally {
        setLoadingJobs(false)
      }
    }
    loadJobs()
  }, [])

  // 1. Initialize Base OpenLayers Map Engine (Max Zoom 28)
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
          { default: XYZ }
        ] = await Promise.all([
          import('ol/Map'),
          import('ol/View'),
          import('ol/layer/Tile'),
          import('ol/source/XYZ'),
        ])

        if (isCancelled) return

        // Default Google Hybrid Satellite Basemap (Satellite + Labels)
        const googleHybridSource = new XYZ({
          url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          maxZoom: 28,
          attributions: '© Google Satellite Maps',
        })

        const baseLayer = new TileLayer({
          source: googleHybridSource,
          properties: { name: 'basemap' },
        })

        const view = new View({
          center: [0, 0],
          zoom: 2,
          maxZoom: 28,
          smoothResolution: true,
          constrainResolution: false,
        })

        mapInstance = new Map({
          target: mapContainerRef.current,
          layers: [baseLayer],
          view: view,
        })

        mapInstanceRef.current = mapInstance

        // Feature Click Inspector
        mapInstance.on('click', (evt) => {
          let foundProps = null
          mapInstance.forEachFeatureAtPixel(evt.pixel, (feature) => {
            foundProps = feature.getProperties()
            return true
          })
          if (foundProps) {
            delete foundProps.geometry
            setSelectedFeatureProps(foundProps)
            setActiveTab('inspector')
          }
        })
      } catch (err) {
        console.error('OpenLayers init error:', err.message)
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

  // Function to Add an Orthomosaic or Vector Layer to Map (Deduplicated, Max Zoom 28)
  const addFieldJobLayer = useCallback(async (job, dataType = 'orthomosaic', options = {}) => {
    if (!mapInstanceRef.current || !job) return

    const { skipFit = false } = options
    const isOrtho = dataType === 'orthomosaic'
    const dedupeKey = `${job.id}_${dataType}`

    if (addedKeysRef.current.has(dedupeKey)) {
      return
    }
    addedKeysRef.current.add(dedupeKey)

    const layerId = `${dedupeKey}_${Date.now()}`
    const layerName = `${job.title} (${isOrtho ? 'Orthomosaic' : 'Vector Boundary'})`

    try {
      let targetProjId = job.project_id || job.projectId || ''
      let downloadUrl = `/api/r2/stream-file?projectId=${targetProjId}&jobId=${job.id}&dataType=${dataType}`
      try {
        const res = await fetch('/api/r2/presigned-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: targetProjId,
            jobId: job.id,
            dataType: dataType,
          }),
        })
        const data = await res.json()
        if (data.downloadUrl) downloadUrl = data.downloadUrl
      } catch (e) {
        console.warn('Presigned download fetch notice:', e.message)
      }

      const map = mapInstanceRef.current

      if (isOrtho) {
        const [
          { default: GeoTIFF },
          { default: WebGLTileLayer },
          { default: View }
        ] = await Promise.all([
          import('ol/source/GeoTIFF'),
          import('ol/layer/WebGLTile'),
          import('ol/View'),
        ])

        const tiffSource = new GeoTIFF({
          sources: [{ url: downloadUrl }],
          normalize: true,
          convertToRGB: true,
        })

        const orthoLayer = new WebGLTileLayer({
          source: tiffSource,
          opacity: 1.0,
          visible: true,
          transition: 0,
          zIndex: 10,
          properties: { id: layerId, name: layerName },
        })

        map.addLayer(orthoLayer)
        layerMapRef.current.set(layerId, orthoLayer)

        const viewOptions = await tiffSource.getView()
        const extent = viewOptions.extent
        const proj = viewOptions.projection

        if (proj) {
          const newView = new View({
            projection: proj,
            center: viewOptions.center || [0, 0],
            zoom: viewOptions.zoom || 15,
            maxZoom: 28,
            smoothResolution: true,
            constrainResolution: false,
          })
          map.setView(newView)
          if (extent && !skipFit) {
            newView.fit(extent, { padding: [50, 50, 50, 50], duration: 800 })
          }
        } else if (extent && !skipFit) {
          map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 800 })
        }

        const newLayerObj = {
          id: layerId,
          name: layerName,
          type: 'ortho',
          jobId: job.id,
          jobTitle: job.title,
          visible: true,
          opacity: 1.0,
          extent: extent,
        }

        setLayers(prev => [newLayerObj, ...prev.filter(l => l.id !== layerId)])
      } else {
        const geoRes = await fetch(downloadUrl)
        if (!geoRes.ok) throw new Error('Vector file not found')

        let geojsonObj
        let parsedFeatures = []
        const fileNameLower = (job.r2_data?.vector_grid?.fileName || downloadUrl).toLowerCase()

        const [
          { default: VectorSource },
          { default: VectorLayer },
          { default: GeoJSON },
          { default: KML },
          { Style, Stroke, Fill }
        ] = await Promise.all([
          import('ol/source/Vector'),
          import('ol/layer/Vector'),
          import('ol/format/GeoJSON'),
          import('ol/format/KML'),
          import('ol/style'),
        ])

        if (fileNameLower.includes('.kml')) {
          const kmlText = await geoRes.text()
          const kmlFormat = new KML({ extractStyles: true })
          parsedFeatures = kmlFormat.readFeatures(kmlText, {
            featureProjection: map.getView().getProjection(),
          })
        } else if (fileNameLower.includes('.zip') || fileNameLower.includes('.shp')) {
          try {
            const arrayBuffer = await geoRes.arrayBuffer()
            const shp = (await import('shpjs')).default
            geojsonObj = await shp(arrayBuffer)
            if (Array.isArray(geojsonObj)) geojsonObj = geojsonObj[0]
          } catch (shpErr) {
            console.warn('Shapefile parse warning, falling back to text:', shpErr.message)
            geojsonObj = await geoRes.json()
          }
        } else {
          geojsonObj = await geoRes.json()
        }

        if (geojsonObj && parsedFeatures.length === 0) {
          const geojsonFormat = new GeoJSON()
          try {
            parsedFeatures = geojsonFormat.readFeatures(geojsonObj, {
              featureProjection: map.getView().getProjection(),
            })
          } catch (e1) {
            try {
              parsedFeatures = geojsonFormat.readFeatures(geojsonObj, {
                dataProjection: 'EPSG:4326',
                featureProjection: map.getView().getProjection(),
              })
            } catch (e2) {
              console.warn('GeoJSON parse fallback error:', e2.message)
            }
          }
        }

        const vectorSource = new VectorSource({
          features: parsedFeatures,
        })

        // Extract available attribute keys from first feature
        const features = vectorSource.getFeatures()
        const sampleKeys = features.length > 0
          ? Object.keys(features[0].getProperties()).filter(k => k !== 'geometry')
          : []

        // Defaults: High-contrast Cyan stroke (#00ffff), width 3, No Fill (transparent), Labels OFF
        const defaultStyle = {
          strokeColor: '#00ffff',
          strokeWidth: 3,
          fillColor: '#3b82f6',
          fillOpacity: 0,
          labelsEnabled: false,
          labelColumn: sampleKeys[0] || '',
          labelTextSize: 12,
          labelPosition: 'center',
          availableKeys: sampleKeys,
        }

        const vectorLayer = new VectorLayer({
          source: vectorSource,
          renderMode: 'vector',
          renderBuffer: 2000,
          updateWhileAnimating: true,
          updateWhileInteracting: true,
          style: new Style({
            stroke: new Stroke({ color: defaultStyle.strokeColor, width: defaultStyle.strokeWidth }),
            fill: new Fill({ color: '#3b82f600' }),
          }),
          opacity: 1.0,
          visible: true,
          zIndex: 100,
          properties: { id: layerId, name: layerName },
        })

        map.addLayer(vectorLayer)
        layerMapRef.current.set(layerId, vectorLayer)

        const extent = vectorSource.getExtent()
        if (extent && extent[0] !== Infinity && !skipFit) {
          map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 800 })
        }

        const newLayerObj = {
          id: layerId,
          name: layerName,
          type: 'vector',
          jobId: job.id,
          jobTitle: job.title,
          visible: true,
          opacity: 1.0,
          extent: extent,
          vectorStyle: defaultStyle,
        }

        setLayers(prev => [newLayerObj, ...prev.filter(l => l.id !== layerId)])
      }
    } catch (err) {
      console.error('Add layer error:', err.message)
      addedKeysRef.current.delete(dedupeKey)
    }
  }, [])

  // Helper to load Orthomosaic first (setting map projection) then Vector Grid second with single zoom fit
  const loadJobDatasetsSequentially = useCallback(async (jobCard) => {
    if (!jobCard) return
    const hasVector = Boolean(jobCard.r2_data?.vector_grid)

    if (jobCard.r2_data?.orthomosaic) {
      await addFieldJobLayer(jobCard, 'orthomosaic', { skipFit: hasVector })
    }
    if (jobCard.r2_data?.vector_grid) {
      await addFieldJobLayer(jobCard, 'vector_grid', { skipFit: false })
    }
  }, [addFieldJobLayer])

  // Listen for BroadcastChannel or URL query param
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const urlJobId = params.get('jobId')

    if (urlJobId && mapInstanceRef.current && processedJobIdRef.current !== urlJobId) {
      const found = availableJobs.find(j => j.id === urlJobId)
      if (found) {
        processedJobIdRef.current = urlJobId
        loadJobDatasetsSequentially(found)
      } else if (!loadingJobs) {
        fetch('/api/test-gis/jobs')
          .then(res => res.json())
          .then(data => {
            const freshJob = (data.jobs || []).find(j => j.id === urlJobId)
            if (freshJob && mapInstanceRef.current) {
              processedJobIdRef.current = urlJobId
              loadJobDatasetsSequentially(freshJob)
            }
          })
          .catch(err => console.warn('Direct job fetch error:', err.message))
      }
    }

    let channel
    try {
      channel = new BroadcastChannel('altiflow_gis_workspace')
      channel.onmessage = async (evt) => {
        const { jobId, dataType } = evt.data || {}
        if (jobId) {
          const found = availableJobs.find(j => j.id === jobId)
          if (found) {
            if (!dataType || dataType === 'all') {
              await loadJobDatasetsSequentially(found)
            } else {
              await addFieldJobLayer(found, dataType)
            }
          } else {
            fetch('/api/test-gis/jobs')
              .then(res => res.json())
              .then(async data => {
                const freshJob = (data.jobs || []).find(j => j.id === jobId)
                if (freshJob) {
                  if (!dataType || dataType === 'all') {
                    await loadJobDatasetsSequentially(freshJob)
                  } else {
                    await addFieldJobLayer(freshJob, dataType)
                  }
                }
              })
              .catch(err => console.warn('Broadcast job fetch error:', err.message))
          }
        }
      }
    } catch (e) {
      console.warn('BroadcastChannel notice:', e.message)
    }

    return () => {
      if (channel) channel.close()
    }
  }, [availableJobs, loadingJobs, addFieldJobLayer, loadJobDatasetsSequentially])

  // Remove Layer
  const removeLayer = (layerId) => {
    const map = mapInstanceRef.current
    const olLayer = layerMapRef.current.get(layerId)
    if (map && olLayer) {
      map.removeLayer(olLayer)
      layerMapRef.current.delete(layerId)
    }
    const foundLayer = layers.find(l => l.id === layerId)
    if (foundLayer) {
      addedKeysRef.current.delete(`${foundLayer.jobId}_${foundLayer.type === 'ortho' ? 'orthomosaic' : 'vector_grid'}`)
    }
    setLayers(prev => prev.filter(l => l.id !== layerId))
    if (activeSettingsLayerId === layerId) setActiveSettingsLayerId(null)
  }

  // Toggle Visibility
  const toggleLayerVisibility = (layerId) => {
    const olLayer = layerMapRef.current.get(layerId)
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const nextVis = !l.visible
        if (olLayer) olLayer.setVisible(nextVis)
        return { ...l, visible: nextVis }
      }
      return l
    }))
  }

  // Change Opacity
  const changeLayerOpacity = (layerId, newOpacity) => {
    const olLayer = layerMapRef.current.get(layerId)
    if (olLayer) olLayer.setOpacity(newOpacity)
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, opacity: newOpacity } : l))
  }

  // Fit Bounds to Layer
  const fitLayerBounds = (layerObj) => {
    const map = mapInstanceRef.current
    if (map && layerObj.extent) {
      map.getView().fit(layerObj.extent, { padding: [50, 50, 50, 50], duration: 800 })
    }
  }

  // Update Vector Symbology & Attribute Text Labels
  const updateVectorSymbology = async (layerId, styleUpdates) => {
    const olLayer = layerMapRef.current.get(layerId)
    if (!olLayer) return

    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const nextStyle = { ...l.vectorStyle, ...styleUpdates }
        import('ol/style').then(({ Style, Stroke, Fill, Text }) => {
          const fillHex = nextStyle.fillColor || '#3b82f6'
          const alphaHex = Math.round((nextStyle.fillOpacity ?? 0) * 255).toString(16).padStart(2, '0')

          olLayer.setStyle((feature) => {
            let labelText = ''
            if (nextStyle.labelsEnabled && nextStyle.labelColumn) {
              const val = feature.get(nextStyle.labelColumn)
              labelText = val !== undefined && val !== null ? String(val) : ''
            }

            return new Style({
              stroke: new Stroke({ color: nextStyle.strokeColor || '#000000', width: nextStyle.strokeWidth || 2 }),
              fill: new Fill({ color: `${fillHex}${alphaHex}` }),
              text: labelText ? new Text({
                font: `bold ${nextStyle.labelTextSize || 12}px sans-serif`,
                fill: new Fill({ color: nextStyle.strokeColor === '#ffffff' ? '#000000' : '#ffffff' }),
                stroke: new Stroke({ color: nextStyle.strokeColor === '#ffffff' ? '#ffffff' : '#000000', width: 3 }),
                offsetY: nextStyle.labelPosition === 'above' ? -14 : nextStyle.labelPosition === 'below' ? 14 : 0,
                text: labelText,
              }) : undefined,
            })
          })
        })
        return { ...l, vectorStyle: nextStyle }
      }
      return l
    }))
  }

  // Switch Basemap Engine
  useEffect(() => {
    if (!mapInstanceRef.current) return
    async function updateBasemap() {
      const map = mapInstanceRef.current
      const layersArr = map.getLayers().getArray()
      const baseLayer = layersArr.find(l => l.get('name') === 'basemap')
      if (!baseLayer) return

      if (basemapType === 'white') {
        baseLayer.setVisible(false)
      } else {
        baseLayer.setVisible(true)
        const { default: XYZ } = await import('ol/source/XYZ')
        if (basemapType === 'google_hybrid') {
          baseLayer.setSource(new XYZ({
            url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            maxZoom: 28,
            attributions: '© Google Satellite Maps',
          }))
        } else if (basemapType === 'carto_dark') {
          baseLayer.setSource(new XYZ({
            url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            maxZoom: 28,
            attributions: '© CartoDB Dark',
          }))
        } else if (basemapType === 'osm') {
          const { default: OSM } = await import('ol/source/OSM')
          baseLayer.setSource(new OSM())
        }
      }
    }
    updateBasemap()
  }, [basemapType])

  // Filter available jobs by Search Query, Stage Filter, and MUST HAVE ATTACHED DATASETS
  const filteredJobs = availableJobs.filter(j => {
    const hasData = Boolean(j.r2_data?.orthomosaic || j.r2_data?.vector_grid)
    if (!hasData) return false

    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q ||
                          (j.title || '').toLowerCase().includes(q) ||
                          (j.job_code || '').toLowerCase().includes(q) ||
                          (j.description || '').toLowerCase().includes(q) ||
                          (j.id || '').toLowerCase().includes(q)
    if (!matchesSearch) return false
    if (stageFilter === 'All Stages') return true

    const filterCat = stageFilter.toLowerCase()
    const jobCat = (j.category || j.stage || '').toLowerCase()

    if (filterCat.includes('stand')) {
      return jobCat.includes('stand') || (j.sc_status && j.sc_status !== 'Pending') || (j.category || 'Stand Count') === 'Stand Count'
    }
    if (filterCat.includes('uni')) {
      return jobCat.includes('uni') || (j.uni_status && j.uni_status !== 'Pending') || j.category === 'Uniformity'
    }

    return jobCat.includes(filterCat)
  })

  const activeSettingsLayer = layers.find(l => l.id === activeSettingsLayerId && l.type === 'vector')

  return (
    <div className={`h-screen w-screen font-sans flex flex-col overflow-hidden ${basemapType === 'white' ? 'bg-white text-zinc-900' : 'bg-zinc-950 text-zinc-100'}`}>
      {/* Header Bar */}
      <header className={`h-14 border-b px-5 flex items-center justify-between shrink-0 z-20 ${basemapType === 'white' ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Globe size={20} />
          </div>
          <div>
            <h1 className={`text-sm font-bold ${basemapType === 'white' ? 'text-zinc-900' : 'text-zinc-100'}`}>AltiFlow Viewer</h1>
          </div>
        </div>

        {/* Action Controls (Clean Header - ONLY Refresh Workspace) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              basemapType === 'white' ? 'bg-zinc-200 border-zinc-300 text-zinc-700 hover:text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Refresh Workspace"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Layer Manager Panel */}
        <aside className={`w-84 border-r flex flex-col shrink-0 z-10 backdrop-blur-md ${
          basemapType === 'white' ? 'bg-zinc-100/95 border-zinc-300 text-zinc-900' : 'bg-zinc-950/95 border-zinc-800 text-zinc-100'
        }`}>
          {/* Navigation Tabs */}
          <div className={`flex border-b p-1 gap-1 ${basemapType === 'white' ? 'bg-zinc-200/80 border-zinc-300' : 'bg-zinc-900/60 border-zinc-800'}`}>
            <button
              onClick={() => setActiveTab('layers')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === 'layers'
                  ? (basemapType === 'white' ? 'bg-white text-emerald-600 shadow' : 'bg-zinc-800 text-emerald-400 shadow')
                  : (basemapType === 'white' ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-zinc-200')
              }`}
            >
              <Layers size={14} /> Layers ({layers.length})
            </button>

            {selectedFeatureProps && (
              <button
                onClick={() => setActiveTab('inspector')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'inspector'
                    ? (basemapType === 'white' ? 'bg-white text-amber-600 shadow' : 'bg-zinc-800 text-amber-400 shadow')
                    : (basemapType === 'white' ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-zinc-200')
                }`}
              >
                <Info size={14} /> Plot Data
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: LAYER MANAGER */}
            {activeTab === 'layers' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider ${basemapType === 'white' ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    Active Layers
                  </span>
                  <button
                    onClick={() => setShowAddJobModal(true)}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow"
                  >
                    <Plus size={14} /> Add Layer
                  </button>
                </div>

                {layers.length === 0 ? (
                  <div className={`p-8 text-center border border-dashed rounded-xl space-y-3 ${basemapType === 'white' ? 'border-zinc-300' : 'border-zinc-800'}`}>
                    <Layers size={24} className="mx-auto text-zinc-500" />
                    <div className={`text-xs font-semibold ${basemapType === 'white' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      No field layers added yet
                    </div>
                    <button
                      onClick={() => setShowAddJobModal(true)}
                      className="px-3 py-1.5 bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-600/30 transition cursor-pointer"
                    >
                      Browse R2 Field Cards
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {layers.map(layer => (
                      <div key={layer.id} className={`border rounded-xl p-3 space-y-2.5 shadow-sm ${
                        basemapType === 'white' ? 'bg-white border-zinc-300' : 'bg-zinc-900/80 border-zinc-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <button
                              onClick={() => toggleLayerVisibility(layer.id)}
                              className={`p-1 rounded transition cursor-pointer ${layer.visible ? (layer.type === 'ortho' ? 'text-emerald-500' : 'text-indigo-500') : 'text-zinc-400'}`}
                            >
                              {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                            </button>
                            <span className={`text-xs font-bold truncate ${basemapType === 'white' ? 'text-zinc-900' : 'text-zinc-100'}`}>
                              {layer.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {layer.type === 'vector' && (
                              <button
                                onClick={() => setActiveSettingsLayerId(activeSettingsLayerId === layer.id ? null : layer.id)}
                                className={`p-1 transition cursor-pointer ${
                                  activeSettingsLayerId === layer.id ? 'text-indigo-500 font-bold' : 'text-zinc-500 hover:text-indigo-400'
                                }`}
                                title="Vector Symbology & Label Settings"
                              >
                                <Settings size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => fitLayerBounds(layer)}
                              className="p-1 text-zinc-500 hover:text-emerald-500 transition cursor-pointer"
                              title="Fit Bounds"
                            >
                              <Maximize2 size={13} />
                            </button>
                            <button
                              onClick={() => removeLayer(layer.id)}
                              className="p-1 text-zinc-500 hover:text-red-500 transition cursor-pointer"
                              title="Remove Layer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className={`flex items-center justify-between text-[11px] font-mono ${basemapType === 'white' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                            <span>Opacity</span>
                            <span>{Math.round(layer.opacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={layer.opacity}
                            onChange={(e) => changeLayerOpacity(layer.id, parseFloat(e.target.value))}
                            className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PLOT DATA INSPECTOR */}
            {activeTab === 'inspector' && selectedFeatureProps && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2 border-zinc-700">
                  <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <Info size={14} /> Selected Plot Feature Attributes
                  </span>
                  <button onClick={() => setSelectedFeatureProps(null)} className="text-zinc-500 hover:text-zinc-300">
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  {Object.entries(selectedFeatureProps).map(([k, v]) => (
                    <div key={k} className={`flex justify-between border rounded-lg p-2 gap-2 ${
                      basemapType === 'white' ? 'bg-white border-zinc-300' : 'bg-zinc-900 border-zinc-800'
                    }`}>
                      <span className="text-zinc-400 truncate">{k}:</span>
                      <span className={`font-semibold truncate ${basemapType === 'white' ? 'text-zinc-900' : 'text-zinc-100'}`}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Map Viewport */}
        <main className={`flex-1 h-full relative ${basemapType === 'white' ? 'bg-white' : 'bg-zinc-950'}`}>
          <div ref={mapContainerRef} className={`w-full h-full z-0 ${basemapType === 'white' ? 'bg-white' : 'bg-zinc-950'}`} />

          {/* Bottom-Right Floating Squircle Basemap Switcher Widget */}
          <div className="absolute bottom-5 right-5 z-20 flex flex-col items-end gap-2">
            {basemapMenuOpen && (
              <div className="bg-zinc-900/95 border border-zinc-800 rounded-2xl p-2 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 min-w-[150px] animate-in fade-in slide-in-from-bottom-2">
                {[
                  { id: 'google_hybrid', label: 'Google Hybrid', icon: '🛰️' },
                  { id: 'osm', label: 'Street Map', icon: '🗺️' },
                  { id: 'carto_dark', label: 'Dark Mode', icon: '🌙' },
                  { id: 'white', label: 'Plain White', icon: '📄' }
                ].map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBasemapType(b.id)
                      setBasemapMenuOpen(false)
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition text-left border cursor-pointer ${
                      basemapType === b.id
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span className="text-base leading-none">{b.icon}</span>
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setBasemapMenuOpen(!basemapMenuOpen)}
              className="h-12 px-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-zinc-100 hover:border-zinc-700 font-bold text-xs shadow-2xl backdrop-blur-md flex items-center gap-2 transition cursor-pointer"
              title="Change Basemap"
            >
              <span className="text-base">
                {basemapType === 'google_hybrid' ? '🛰️' : basemapType === 'osm' ? '🗺️' : basemapType === 'carto_dark' ? '🌙' : '📄'}
              </span>
              <span>
                {basemapType === 'google_hybrid' ? 'Google Hybrid' : basemapType === 'osm' ? 'Street Map' : basemapType === 'carto_dark' ? 'Dark Mode' : 'Plain White'}
              </span>
            </button>
          </div>
        </main>
      </div>

      {/* Vector Symbology & Feature Label Inline Settings Modal */}
      {activeSettingsLayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-2xl text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-indigo-400">
                <Settings size={16} /> Vector Symbology & Labels
              </h3>
              <button onClick={() => setActiveSettingsLayerId(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Stroke / Board Setup */}
              <div className="space-y-2 bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3">
                <span className="font-bold text-zinc-200">Boundary Board (Stroke)</span>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Stroke Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={activeSettingsLayer.vectorStyle?.strokeColor || '#000000'}
                      onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { strokeColor: e.target.value })}
                      className="w-7 h-7 rounded-lg bg-transparent border border-zinc-700 cursor-pointer"
                    />
                    <div className="flex gap-1">
                      {['#000000', '#3b82f6', '#10b981', '#ef4444', '#ffffff'].map(c => (
                        <button
                          key={c}
                          onClick={() => updateVectorSymbology(activeSettingsLayer.id, { strokeColor: c })}
                          className="w-5 h-5 rounded border border-zinc-700 transition cursor-pointer"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-zinc-400 font-mono text-[11px]">
                    <span>Stroke Thickness</span>
                    <span>{activeSettingsLayer.vectorStyle?.strokeWidth || 2} px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={activeSettingsLayer.vectorStyle?.strokeWidth || 2}
                    onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { strokeWidth: parseInt(e.target.value) })}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>

              {/* Fill Color & Opacity (Default Transparent) */}
              <div className="space-y-2 bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3">
                <span className="font-bold text-zinc-200">Plot Fill Color & Opacity</span>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Fill Color</span>
                  <input
                    type="color"
                    value={activeSettingsLayer.vectorStyle?.fillColor || '#3b82f6'}
                    onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { fillColor: e.target.value })}
                    className="w-7 h-7 rounded-lg bg-transparent border border-zinc-700 cursor-pointer"
                  />
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-zinc-400 font-mono text-[11px]">
                    <span>Fill Opacity</span>
                    <span>{Math.round((activeSettingsLayer.vectorStyle?.fillOpacity ?? 0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={activeSettingsLayer.vectorStyle?.fillOpacity ?? 0}
                    onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { fillOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>

              {/* Attribute Feature Labels */}
              <div className="space-y-3 bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200">Feature Text Labels</span>
                  <button
                    onClick={() => updateVectorSymbology(activeSettingsLayer.id, { labelsEnabled: !activeSettingsLayer.vectorStyle?.labelsEnabled })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activeSettingsLayer.vectorStyle?.labelsEnabled
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {activeSettingsLayer.vectorStyle?.labelsEnabled ? 'Labels ON' : 'Labels OFF'}
                  </button>
                </div>

                {activeSettingsLayer.vectorStyle?.labelsEnabled && (
                  <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                    <div className="space-y-1">
                      <label className="text-zinc-400 font-mono text-[11px]">Attribute Column</label>
                      <select
                        value={activeSettingsLayer.vectorStyle?.labelColumn || ''}
                        onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { labelColumn: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="">Select Attribute Key...</option>
                        {(activeSettingsLayer.vectorStyle?.availableKeys || []).map(k => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-mono text-[11px]">Text Size</label>
                        <select
                          value={activeSettingsLayer.vectorStyle?.labelTextSize || 12}
                          onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { labelTextSize: parseInt(e.target.value) })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                        >
                          {[10, 11, 12, 14, 16, 18, 20].map(s => (
                            <option key={s} value={s}>{s} px</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400 font-mono text-[11px]">Label Position</label>
                        <select
                          value={activeSettingsLayer.vectorStyle?.labelPosition || 'center'}
                          onChange={(e) => updateVectorSymbology(activeSettingsLayer.id, { labelPosition: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                        >
                          <option value="center">Center</option>
                          <option value="above">Above</option>
                          <option value="below">Below</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Job Layer Modal with Stage Filter & Search */}
      {showAddJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-2xl text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Layers size={16} className="text-emerald-400" /> Select Field Layer to Add
              </h3>
              <button onClick={() => setShowAddJobModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>

            {/* Search & Pipeline Stage Filter Controls */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search field title or job code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Stage Filter Tabs (Strictly: All Stages, Stand Count, Uniformity) */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                {['All Stages', 'Stand Count', 'Uniformity'].map(stg => (
                  <button
                    key={stg}
                    onClick={() => setStageFilter(stg)}
                    className={`px-3 py-1 rounded-lg shrink-0 transition cursor-pointer border ${
                      stageFilter === stg
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {stg}
                  </button>
                ))}
              </div>
            </div>

            {loadingJobs ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading field cards...</div>
            ) : filteredJobs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">No field cards match the search/stage filter.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredJobs.map(job => (
                  <div key={job.id} className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-zinc-200">{job.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500 font-mono">{job.job_code || job.id?.slice(0, 8)}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                          {job.category || 'Stand Count'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {job.r2_data?.orthomosaic && (
                        <button
                          onClick={() => {
                            addFieldJobLayer(job, 'orthomosaic')
                            setShowAddJobModal(false)
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30"
                          title="Add Field Orthomosaic Raster Layer"
                        >
                          + Ortho
                        </button>
                      )}
                      {job.r2_data?.vector_grid && (
                        <button
                          onClick={() => {
                            addFieldJobLayer(job, 'vector_grid')
                            setShowAddJobModal(false)
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border bg-indigo-600/20 text-indigo-400 border-indigo-500/40 hover:bg-indigo-600/30"
                          title="Add Field Vector Grid Layer"
                        >
                          + Vector
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
