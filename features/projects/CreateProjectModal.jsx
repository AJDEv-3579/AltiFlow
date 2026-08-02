import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Plus } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'

export function CreateProjectModal({ user, onDone, onCancel }) {
  const isSuperAdmin = user?.role === 'Super-Admin'
  const isClientAdmin = user?.role === 'Client-Admin'
  const [form, setForm] = useState({
    client_id: '',
    name: '',
    type: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    head: user?.username || '',
  })
  const [clients, setClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [busy, setBusy] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!isSuperAdmin) return
    let mounted = true
    async function loadClients() {
      setLoadingClients(true)
      try {
        const r = await api('/clients')
        if (!mounted) return
        const nextClients = r.clients || []
        setClients(nextClients)
        if (nextClients.length > 0) {
          setForm((f) => ({ ...f, client_id: f.client_id || nextClients[0].id }))
        }
      } catch (e) {
        toast.error(e.message)
      } finally {
        if (mounted) setLoadingClients(false)
      }
    }
    loadClients()
    return () => { mounted = false }
  }, [isSuperAdmin])

  async function submit(e) {
    e.preventDefault()
    if (!form.type || !form.start_date || !form.head) {
      toast.error('Project category and project admin are required')
      return
    }
    if (isSuperAdmin && !form.client_id) {
      toast.error('Client selection is required for Super Admin')
      return
    }
    setBusy(true)
    try {
      await api('/client-projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          client_id: isSuperAdmin ? form.client_id : undefined,
          name: form.name.trim() || `${form.type} - ${form.head}`,
          end_date: form.end_date || null,
        }),
      })
      toast.success('Project created!')
      onDone()
    } catch (e) {
      toast.error(e.message)
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
            <div className="font-semibold text-lg text-zinc-100">New Project</div>
            <div className="text-xs text-zinc-500 mt-0.5">Create a workspace project for your team</div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {isSuperAdmin && (
            <Field label="Client *">
              <select
                value={form.client_id}
                onChange={e => set('client_id', e.target.value)}
                disabled={loadingClients || clients.length === 0}
                className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 disabled:opacity-60"
              >
                {clients.length === 0 && <option value="">No clients available</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}
          {isClientAdmin && (
            <Field label="Client">
              <div className="h-11 px-3 rounded-lg border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-300 flex items-center">
                {user?.client_name || 'Your organization'}
              </div>
            </Field>
          )}
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
            <Btn type="submit" disabled={busy || !form.type || !form.start_date || !form.head || (isSuperAdmin && !form.client_id)} className="flex-1" icon={Plus}>
              {busy ? 'Creating…' : 'Create Project'}
            </Btn>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default CreateProjectModal
