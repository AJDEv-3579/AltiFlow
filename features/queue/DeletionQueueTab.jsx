import React, { useState } from 'react'
import { toast } from 'sonner'
import { User } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function DeletionQueueTab({ requests = [], onRefresh }) {
  const [busy, setBusy] = useState(null)

  async function resolve(id, action) {
    setBusy(id)
    try {
      await api(`/deletion-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      toast.success(action === 'approve' ? 'User deleted.' : 'Request rejected.')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 font-semibold">Pending user deletion requests</div>
      {requests.length === 0 && <div className="text-sm text-zinc-600">No pending requests.</div>}
      <div className="space-y-3">
        {requests.map(r => (
          <div key={r.id} className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40">
            <div>
              <div className="font-medium flex items-center gap-2 text-zinc-100">
                <User size={14} className="text-zinc-400" />
                <span>{r.target_username}</span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-semibold">{r.target_role}</span>
                {r.target_client && <span className="text-[10px] text-zinc-500">{r.target_client}</span>}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Requested by <span className="text-zinc-300">{r.requested_by_username}</span> · {new Date(r.created_at).toLocaleString()}</div>
              {r.reason && <div className="text-xs text-zinc-400 mt-1">Reason: {r.reason}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Btn variant="danger" size="sm" disabled={busy === r.id} onClick={() => resolve(r.id, 'approve')}>Approve</Btn>
              <Btn variant="ghost" size="sm" disabled={busy === r.id} onClick={() => resolve(r.id, 'reject')}>Reject</Btn>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

export default DeletionQueueTab
