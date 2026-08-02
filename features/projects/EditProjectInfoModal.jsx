import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Settings } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'

export function EditProjectInfoModal({ project, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: project?.name || '',
    type: project?.type || '',
    start_date: project?.start_date || '',
    end_date: project?.end_date || '',
    head: project?.head || '',
  })
  const [busy, setBusy] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.type || !form.start_date || !form.head) {
      toast.error('Project category and project admin are required')
      return
    }
    setBusy(true)
    try {
      const r = await api(`/client-projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          start_date: form.start_date,
          end_date: form.end_date || null,
          head: form.head.trim(),
        }),
      })
      toast.success('Project info updated')
      onDone?.(r.project)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg glass-strong rounded-t-3xl md:rounded-2xl border border-zinc-800/80 overflow-y-auto max-h-[90vh]"
      >
        <div className="px-6 py-5 border-b border-zinc-800/60 flex items-center justify-between">
          <div>
            <div className="font-semibold text-lg text-zinc-100">Edit Project Info</div>
            <div className="text-xs text-zinc-500 mt-0.5">Update workspace details</div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Field label="Project Name (optional)">
            <TextInput value={form.name} onChange={v => set('name', v)} placeholder="e.g., North Region Survey Q3" />
          </Field>
          <Field label="Project Category *">
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
            >
              <option value="">Select category…</option>
              <option value="Aerial Mapping">Aerial Mapping</option>
              <option value="Photogrammetry">Photogrammetry</option>
              <option value="LiDAR Survey">LiDAR Survey</option>
              <option value="Inspection">Inspection</option>
              <option value="3D Modelling">3D Modelling</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date *">
              <TextInput type="date" value={form.start_date} onChange={v => set('start_date', v)} />
            </Field>
            <Field label="End Date (optional)">
              <TextInput type="date" value={form.end_date} onChange={v => set('end_date', v)} />
            </Field>
          </div>
          <Field label="Project Admin *">
            <TextInput value={form.head} onChange={v => set('head', v)} placeholder="Project admin name" />
          </Field>
          <div className="flex gap-3 pt-2">
            <Btn type="button" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Btn>
            <Btn type="submit" disabled={busy || !form.type || !form.start_date || !form.head} className="flex-1" icon={Settings}>
              {busy ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default EditProjectInfoModal
