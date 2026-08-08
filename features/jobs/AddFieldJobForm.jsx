import React, { useState } from 'react'
import { toast } from 'sonner'
import { X, Upload, Folder, FileText, CheckCircle2, AlertTriangle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'

export function AddFieldJobForm({ project, orgUsers = [], onDone, onCancel, canAssignManual = false, existingJobs = [] }) {
  const BLANK_FLIGHT = () => ({ image_count: null, csv_rows: null })
  const adminAssignees = orgUsers.filter(u => ['Admin', 'Super-Admin'].includes(u.role))
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    title: '',
    capture_date: '',
    drone_name: '',
    category: 'Stand Count',
    flight_count: 1,
    flights: [BLANK_FLIGHT()],
    has_logs: false,
    comments: '',
    assigned_to: '',
  })
  const [busy, setBusy] = useState(false)

  const trimmedTitle = form.title.trim().toLowerCase()
  const isDuplicateName = Boolean(
    trimmedTitle &&
    existingJobs.some(j => (j.title || '').trim().toLowerCase() === trimmedTitle && (j.category || 'Stand Count') === form.category)
  )

  function setFlightCount(n) {
    const count = Math.max(1, Math.min(10, n))
    setForm(f => ({
      ...f,
      flight_count: count,
      flights: Array.from({ length: count }, (_, i) => f.flights[i] || BLANK_FLIGHT()),
    }))
  }

  const IMAGE_EXTS = /\.(jpe?g|png)$/i
  function handleFolderSelect(e, idx) {
    const count = Array.from(e.target.files).filter(f => IMAGE_EXTS.test(f.name)).length
    setForm(f => {
      const flights = [...f.flights]
      flights[idx] = { ...flights[idx], image_count: count }
      return { ...f, flights }
    })
  }

  function handleCSVSelect(e, idx) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataRows = Math.max(0, ev.target.result.split('\n').filter(l => l.trim()).length - 1)
      setForm(f => {
        const flights = [...f.flights]
        flights[idx] = { ...flights[idx], csv_rows: dataRows }
        return { ...f, flights }
      })
    }
    reader.readAsText(file)
  }

  function setFlightMetric(idx, key, value) {
    setForm(f => {
      const flights = [...f.flights]
      const normalized = value === '' || value === null || value === undefined
        ? null
        : Math.max(0, Number(value) || 0)
      flights[idx] = { ...flights[idx], [key]: normalized }
      return { ...f, flights }
    })
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitted(true)
    if (!form.title.trim()) {
      toast.error('Field Name is required')
      return
    }

    if (isDuplicateName) {
      toast.error(`Field name "${form.title.trim()}" already exists in the ${form.category} category. Duplicate field names are not allowed within the same category.`)
      return
    }

    setBusy(true)
    try {
      await api(`/client-projects/${project.id}/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          capture_date: form.capture_date || null,
          drone_name: form.drone_name.trim() || null,
          category: form.category,
          flight_count: form.flight_count,
          flights: form.flights,
          has_logs: form.has_logs,
          comments: form.comments.trim() || null,
          assigned_to: canAssignManual ? (form.assigned_to || null) : null,
        }),
      })
      toast.success('Field job card submitted')
      onDone()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const missing = {
    title: submitted && !form.title.trim(),
  }
  const valid = form.title.trim() && !isDuplicateName
  const fieldErrorCls = hasError => hasError ? 'border-red-500/70 focus:border-red-400' : ''

  return (
    <GlassCard className="p-4 rounded-2xl border border-zinc-800/70">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-zinc-200">New Field Job Card</div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 cursor-pointer"><X size={14} /></button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Field Name *">
            <TextInput className={fieldErrorCls(missing.title || isDuplicateName)} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g., Block A North" />
            {isDuplicateName && (
              <div className="text-[11px] text-red-400 mt-1 flex items-center gap-1 font-medium">
                <AlertTriangle size={12} className="shrink-0" /> Field name already exists in {form.category}.
              </div>
            )}
          </Field>
          <Field label="Date of Capture">
            <input type="date" value={form.capture_date}
              onChange={e => setForm(f => ({ ...f, capture_date: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 [color-scheme:dark]" />
          </Field>
          <Field label="Category *">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
              <option value="Stand Count">Stand Count</option>
              <option value="Uniformity">Uniformity</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Drone Name">
            <TextInput value={form.drone_name} onChange={v => setForm(f => ({ ...f, drone_name: v }))} placeholder="e.g., DJI Mavic 3" />
          </Field>
          <Field label="No. of Flights">
            <div className="flex items-center gap-2 h-11">
              <button type="button" onClick={() => setFlightCount(form.flight_count - 1)}
                className="w-10 h-10 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center text-lg font-bold shrink-0 cursor-pointer">−</button>
              <div className="flex-1 h-10 bg-zinc-900/60 border border-zinc-800 rounded-lg flex items-center justify-center font-mono font-semibold text-zinc-100">
                {form.flight_count}
              </div>
              <button type="button" onClick={() => setFlightCount(form.flight_count + 1)}
                className="w-10 h-10 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center text-lg font-bold shrink-0 cursor-pointer">+</button>
            </div>
          </Field>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Flight Data</div>
          {form.flights.map((flight, i) => {
            const missingFlight = submitted && (flight.image_count === null)
            return (
              <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-zinc-900/40 border transition ${
                missingFlight ? 'border-red-500/50 bg-red-500/5' : 'border-zinc-800/60'
              }`}>
                <div className="text-xs font-semibold text-zinc-400 min-w-[70px] flex items-center gap-1.5 shrink-0">
                  <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-300 font-mono">
                    {i + 1}
                  </span>
                  <span>Flight {i + 1}</span>
                </div>

                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      value={flight.image_count ?? ''}
                      onChange={e => setFlightMetric(i, 'image_count', e.target.value)}
                      placeholder="Images (required)"
                      className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-9 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition ${
                        missingFlight ? 'border-red-500/50 focus:border-red-400' : ''
                      }`}
                    />
                    <label htmlFor={`img-${project?.id || 'p'}-${i}`} className="absolute right-2.5 p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" title="Select folder to auto-count images">
                      <Folder size={14} />
                    </label>
                    <input id={`img-${project?.id || 'p'}-${i}`} type="file" multiple className="sr-only"
                      ref={el => { if (el) { el.webkitdirectory = true } }}
                      onChange={e => handleFolderSelect(e, i)} />
                  </div>
                </div>

                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      value={flight.csv_rows ?? ''}
                      onChange={e => setFlightMetric(i, 'csv_rows', e.target.value)}
                      placeholder="CSV Rows (optional)"
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-9 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition"
                    />
                    <label htmlFor={`csv-${project?.id || 'p'}-${i}`} className="absolute right-2.5 p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" title="Select CSV to auto-count rows">
                      <FileText size={14} />
                    </label>
                    <input id={`csv-${project?.id || 'p'}-${i}`} type="file" accept=".csv,.CSV" className="sr-only"
                      onChange={e => handleCSVSelect(e, i)} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none group">
          <div onClick={() => setForm(f => ({ ...f, has_logs: !f.has_logs }))}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
              form.has_logs ? 'bg-emerald-500 border-emerald-500' : 'bg-zinc-900/60 border-zinc-700 group-hover:border-zinc-500'}`}>
            {form.has_logs && <CheckCircle2 size={12} className="text-white" />}
          </div>
          <span className="text-sm text-zinc-300">Logs Available</span>
        </label>

        <Field label="Comments">
          <textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} rows={2}
            placeholder="Any notes about this field capture…"
            className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none ${fieldErrorCls(missing.comments)}`} />
        </Field>
        {submitted && !valid && <div className="text-xs text-red-300">Please fill all required fields before submitting.</div>}

        {canAssignManual && adminAssignees.length > 0 && (
          <Field label="Assign to Admin">
            <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
              <option value="">Unassigned</option>
              {adminAssignees.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </Field>
        )}

        <div className="flex gap-2 pt-1">
          <Btn type="button" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Btn>
          <Btn type="submit" disabled={busy} className="flex-1" icon={Upload}>
            {busy ? 'Submitting…' : 'Submit Job Card'}
          </Btn>
        </div>
      </form>
    </GlassCard>
  )
}

export default AddFieldJobForm
