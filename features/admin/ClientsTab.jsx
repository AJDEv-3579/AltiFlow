import React, { useState } from 'react'
import { toast } from 'sonner'
import { Building2, Plus, Trash2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'

export function ClientsTab({ clients = [], onRefresh, isSuperAdmin }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api('/clients', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      setName('')
      toast.success('Client created')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function del(id) {
    if (!confirm('Delete this client? It can be restored from Bin.')) return
    try {
      await api(`/clients/${id}`, { method: 'DELETE' })
      toast.success('Moved to Bin')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <GlassCard className="p-5">
          <div className="text-xs uppercase font-semibold tracking-wider text-zinc-500 mb-3">Add new client</div>
          <div className="flex gap-2">
            <TextInput value={name} onChange={setName} placeholder="Client name (e.g., Tesla, Shell)" />
            <Btn onClick={create} disabled={busy || !name.trim()} icon={Plus}>Create</Btn>
          </div>
        </GlassCard>
      )}
      <GlassCard className="p-5">
        <div className="text-xs uppercase font-semibold tracking-wider text-zinc-500 mb-3">All clients</div>
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                  <Building2 size={18} />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100 text-sm">{c.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500">ID: {c.id.slice(0, 8)}</div>
                </div>
              </div>
              {isSuperAdmin && (
                <button onClick={() => del(c.id)} className="p-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-colors cursor-pointer" title="Delete client">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

export default ClientsTab
