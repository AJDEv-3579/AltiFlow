import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Edit3, X, AlertTriangle } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'

export function EditFieldJobFormModal({ project, job, orgUsers = [], onDone, onCancel, canAssignManual = false, existingJobs = [] }) {
  const adminAssignees = orgUsers.filter(u => u.role === 'Admin')
  const [form, setForm] = useState({
    title: job.title || '',
    capture_date: job.capture_date || '',
    drone_name: job.drone_name || '',
    category: job.category || 'Stand Count',
    flight_count: job.flight_count || (Array.isArray(job.flights) && job.flights.length > 0 ? job.flights.length : 1),
    flights: Array.isArray(job.flights) && job.flights.length > 0 ? job.flights : [{ image_count: null, csv_rows: null }],
    has_logs: Boolean(job.has_logs),
    comments: job.comments || '',
    assigned_to: job.assigned_to || '',
  })
  const [busy, setBusy] = useState(false)

  const trimmedTitle = form.title.trim().toLowerCase()
  const isDuplicateName = Boolean(
    trimmedTitle &&
    existingJobs.some(j => j.id !== job.id && (j.title || '').trim().toLowerCase() === trimmedTitle && (j.category || 'Stand Count') === form.category)
  )

  function setFlightCount(n) {
    const count = Math.max(1, Math.min(10, n))
    setForm(f => ({
      ...f, flight_count: count,
      flights: Array.from({ length: count }, (_, i) => f.flights[i] || { image_count: null, csv_rows: null }),
    }))
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
    if (!form.title.trim()) {
      toast.error('Field Name is required')
      return
    }

    if (isDuplicateName) {
      toast.error(`Field name "${form.title.trim()}" already exists in the ${form.category} category.`)
      return
    }

    setBusy(true)
    try {
      await api(`/client-projects/${project.id}/jobs/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.title.trim(),
          capture_date: form.capture_date || null,
          drone_name: form.drone_name.trim() || null,
          category: form.category,
          flight_count: form.flight_count,
          flights: form.flights,
          has_logs: form.has_logs,
          comments: form.comments.trim() || null,
          assigned_to: canAssignManual ? (form.assigned_to || null) : undefined,
        }),
      })
      toast.success('Job card updated successfully')
      onDone()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="font-semibold text-zinc-100 flex items-center gap-2">
            <Edit3 size={16} className="text-amber-400" />
            Edit Field Job Card
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 cursor-pointer"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Field Name *">
              <TextInput value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g., Block A North" />
              {isDuplicateName && (
                <div className="text-[11px] text-red-400 mt-1 flex items-center gap-1 font-medium">
                  <AlertTriangle size={12} className="shrink-0" /> Duplicate in {form.category}.
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
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Flight Metrics</div>
            {form.flights.map((flight, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
                <div className="text-xs font-semibold text-zinc-400 min-w-[70px] flex items-center gap-1.5 shrink-0">
                  <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-300 font-mono">{i + 1}</span>
                  <span>Flight {i + 1}</span>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input type="number" min="0" value={flight.image_count ?? ''}
                    onChange={e => setFlightMetric(i, 'image_count', e.target.value)}
                    placeholder="Image count"
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
                  <input type="number" min="0" value={flight.csv_rows ?? ''}
                    onChange={e => setFlightMetric(i, 'csv_rows', e.target.value)}
                    placeholder="CSV rows"
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <label className="flex items-center gap-2 cursor-pointer py-2">
              <input type="checkbox" checked={form.has_logs} onChange={e => setForm(f => ({ ...f, has_logs: e.target.checked }))} className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-amber-500" />
              <span className="text-xs text-zinc-300">Logs Uploaded</span>
            </label>
            {canAssignManual && (
              <div className="md:col-span-2">
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-xs text-zinc-100 focus:outline-none cursor-pointer">
                  <option value="">Auto-assign (Round Robin)</option>
                  {adminAssignees.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
            )}
          </div>

          <Field label="Notes / Comments">
            <textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
              placeholder="Capture notes or comments..." rows={2}
              className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600" />
          </Field>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between shrink-0">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 font-medium cursor-pointer">Cancel</button>
            <Btn type="submit" disabled={busy || !form.title.trim() || isDuplicateName} variant="primary">
              {busy ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default EditFieldJobFormModal
