import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Upload, Download, FileText, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function BulkUploadJobsModal({ project, onDone, onCancel }) {
  const [rows, setRows] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)
  const fileRef = useRef(null)

  function downloadTemplate() {
    const headers = [
      'field_name', 'capture_date', 'drone_name', 'category', 'flight_count',
      'has_logs', 'comments',
      'flight_1_image_count', 'flight_1_csv_rows',
      'flight_2_image_count', 'flight_2_csv_rows',
      'flight_3_image_count', 'flight_3_csv_rows',
    ]
    const example1 = ['Block A North', '2025-07-15', 'DJI Mavic 3', 'Stand Count', '2', 'false', 'Clear weather morning flight', '1200', '350', '980', '310', '', '']
    const example2 = ['Field B East', '2025-07-16', 'DJI Phantom 4', 'Uniformity', '1', 'true', 'Overcast, stable conditions', '850', '', '', '', '', '']
    const csvContent = [headers.join(','), example1.join(','), example2.join(',')].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'altiflow_job_cards_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function parseCSVLine(line) {
    const result = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (c === ',' && !inQuotes) {
        result.push(field.trim())
        field = ''
      } else {
        field += c
      }
    }
    result.push(field.trim())
    return result
  }

  function validateRow(obj, lineNum) {
    const errors = []
    const fieldName = (obj['field_name'] || '').trim()
    const captureDate = (obj['capture_date'] || '').trim()
    const droneName = (obj['drone_name'] || '').trim()
    const categoryRaw = (obj['category'] || 'Stand Count').trim()
    const flightCountRaw = (obj['flight_count'] || '').trim()
    const hasLogs = (obj['has_logs'] || '').trim().toLowerCase() === 'true'
    const comments = (obj['comments'] || '').trim()

    if (!fieldName) errors.push('field_name is required')
    if (captureDate && !/^\d{4}-\d{2}-\d{2}$/.test(captureDate)) errors.push('capture_date must be YYYY-MM-DD format if provided')

    const VALID_CATS = ['Stand Count', 'Uniformity']
    const category = categoryRaw && VALID_CATS.includes(categoryRaw) ? categoryRaw : 'Stand Count'

    const flightCountParsed = flightCountRaw ? parseInt(flightCountRaw, 10) : 1
    const flightCount = isNaN(flightCountParsed) ? 1 : Math.min(Math.max(flightCountParsed, 1), 10)
    if (flightCountRaw && (isNaN(flightCountParsed) || flightCountParsed < 1 || flightCountParsed > 10)) {
      errors.push('flight_count must be a number between 1 and 10')
    }

    const flights = []
    const effectiveFlightCount = isNaN(flightCount) ? 1 : Math.min(Math.max(flightCount, 1), 10)
    for (let i = 1; i <= effectiveFlightCount; i++) {
      const imgRaw = (obj[`flight_${i}_image_count`] || '').trim()
      const csvRaw = (obj[`flight_${i}_csv_rows`] || '').trim()
      const imageCount = imgRaw !== '' ? parseInt(imgRaw, 10) : null
      if (imageCount === null || isNaN(imageCount) || imageCount < 0) {
        errors.push(`flight_${i}_image_count is required and must be a non-negative number`)
      }
      const csvRows = csvRaw !== '' ? parseInt(csvRaw, 10) : null
      flights.push({
        image_count: imageCount === null || isNaN(imageCount) ? null : imageCount,
        csv_rows: csvRows === null || isNaN(csvRows) ? null : csvRows,
      })
    }

    return {
      lineNum,
      fieldName,
      captureDate,
      droneName,
      category,
      flightCount: effectiveFlightCount,
      hasLogs,
      comments,
      flights,
      errors,
      valid: errors.length === 0,
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
      if (lines.length < 2) {
        toast.error('CSV must have a header row and at least one data row')
        return
      }
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
      const parsed = lines.slice(1).map((line, idx) => {
        const vals = parseCSVLine(line)
        const obj = {}
        headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim() })
        return validateRow(obj, idx + 2)
      })
      setRows(parsed)
      setResults(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function submitAll() {
    const validRows = rows.filter(r => r.valid)
    if (!validRows.length) return
    setSubmitting(true)
    setProgress(0)
    const resultList = []
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i]
      try {
        await api(`/client-projects/${project.id}/jobs`, {
          method: 'POST',
          body: JSON.stringify({
            title: r.fieldName,
            capture_date: r.captureDate,
            drone_name: r.droneName,
            category: r.category,
            flight_count: r.flightCount,
            flights: r.flights,
            has_logs: r.hasLogs,
            comments: r.comments,
          }),
        })
        resultList.push({ lineNum: r.lineNum, fieldName: r.fieldName, ok: true })
      } catch (err) {
        resultList.push({ lineNum: r.lineNum, fieldName: r.fieldName, ok: false, error: err.message })
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }
    setResults(resultList)
    setSubmitting(false)
  }

  const validCount = rows.filter(r => r.valid).length
  const errorCount = rows.filter(r => !r.valid).length
  const successCount = results ? results.filter(r => r.ok).length : 0
  const failCount = results ? results.filter(r => !r.ok).length : 0

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <div className="font-semibold text-zinc-100 flex items-center gap-2">
              <Upload size={16} className="text-zinc-400" />
              Bulk Import Job Cards
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">Upload a CSV file to create multiple field job cards at once</div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
            <div>
              <div className="text-sm font-medium text-zinc-200">Download Template</div>
              <div className="text-xs text-zinc-500 mt-0.5">Get the CSV template with all required columns and example data</div>
            </div>
            <Btn variant="outline" size="sm" icon={Download} onClick={downloadTemplate}>
              Template CSV
            </Btn>
          </div>

          <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Required Columns</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400">
              <span><span className="text-zinc-200 font-mono">field_name</span> — Field / block name</span>
              <span><span className="text-zinc-200 font-mono">capture_date</span> — YYYY-MM-DD format</span>
              <span><span className="text-zinc-200 font-mono">drone_name</span> — Drone model used</span>
              <span><span className="text-zinc-200 font-mono">category</span> — Stand Count or Uniformity</span>
              <span><span className="text-zinc-200 font-mono">flight_count</span> — Number of flights (1–10)</span>
              <span><span className="text-zinc-200 font-mono">comments</span> — Capture notes</span>
              <span><span className="text-zinc-400 font-mono">has_logs</span> — true / false (optional)</span>
              <span><span className="text-zinc-200 font-mono">flight_N_image_count</span> — Per-flight image count</span>
            </div>
          </div>

          {!results && (
            <div>
              <label
                htmlFor="bulk-csv-file"
                className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-500 hover:bg-zinc-800/20 transition-colors"
              >
                <FileText size={32} className="text-zinc-500" />
                <div className="text-sm text-center">
                  <span className="font-medium text-zinc-200">Click to choose your CSV file</span>
                  <br />
                  <span className="text-xs text-zinc-500">Only .csv files are supported</span>
                </div>
                {rows.length > 0 && (
                  <div className="text-xs text-zinc-400 mt-1">
                    {rows.length} rows loaded — click to replace file
                  </div>
                )}
              </label>
              <input
                id="bulk-csv-file"
                ref={fileRef}
                type="file"
                accept=".csv,.CSV"
                className="sr-only"
                onChange={handleFile}
              />
            </div>
          )}

          {rows.length > 0 && !results && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-sm font-medium text-zinc-200">{rows.length} row{rows.length !== 1 ? 's' : ''} parsed</div>
                {validCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    {validCount} valid
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">
                    {errorCount} with errors
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-xs ${row.valid ? 'border-zinc-800/80 bg-zinc-900/40' : 'border-red-500/30 bg-red-500/5'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium ${row.valid ? 'text-zinc-200' : 'text-red-300'}`}>
                        Row {row.lineNum}: {row.fieldName || '(no field name)'}
                      </span>
                      {row.valid
                        ? <span className="text-emerald-400 flex items-center gap-1 shrink-0"><CheckCircle2 size={11} /> Valid</span>
                        : <span className="text-red-400 shrink-0">Invalid</span>}
                    </div>
                    {row.valid && (
                      <div className="mt-1 text-zinc-500">
                        {row.captureDate} · {row.droneName} · {row.category} · {row.flightCount} flight{row.flightCount !== 1 ? 's' : ''}
                        {row.hasLogs && ' · Logs available'}
                      </div>
                    )}
                    {!row.valid && (
                      <div className="mt-1 text-red-400">{row.errors.join(' · ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {submitting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Submitting job cards…</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-zinc-200">Import Complete</div>
                {successCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    {successCount} created
                  </span>
                )}
                {failCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">
                    {failCount} failed
                  </span>
                )}
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2.5 rounded-lg text-xs border ${r.ok ? 'border-zinc-800 bg-zinc-900/30' : 'border-red-500/30 bg-red-500/5'}`}
                  >
                    {r.ok
                      ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                      : <AlertTriangle size={12} className="text-red-400 shrink-0" />}
                    <span className={`flex-1 ${r.ok ? 'text-zinc-300' : 'text-red-300'}`}>
                      Row {r.lineNum}: {r.fieldName}
                    </span>
                    {!r.ok && <span className="text-red-400 text-right">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 shrink-0 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            {!results && rows.length === 0 && 'Select a CSV file to get started'}
            {!results && validCount > 0 && `${validCount} job card${validCount !== 1 ? 's' : ''} ready to import`}
            {!results && rows.length > 0 && validCount === 0 && 'No valid rows — fix errors and re-upload'}
            {results && `${successCount} of ${results.length} job cards created successfully`}
          </div>
          <div className="flex gap-2 shrink-0">
            {results ? (
              <Btn onClick={() => { onDone(); onCancel() }}>Done</Btn>
            ) : (
              <>
                <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
                <Btn
                  disabled={validCount === 0 || submitting}
                  onClick={submitAll}
                  icon={Upload}
                >
                  {submitting ? 'Importing…' : `Import ${validCount > 0 ? validCount : ''} Job Card${validCount !== 1 ? 's' : ''}`}
                </Btn>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default BulkUploadJobsModal
