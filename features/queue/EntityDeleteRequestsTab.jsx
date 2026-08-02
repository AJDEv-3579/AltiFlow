import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function EntityDeleteRequestsTab({ user }) {
  const canReview = ['Super-Admin', 'Client-Admin'].includes(user?.role)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api('/entity-delete-requests')
      setRequests(r.requests || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function resolve(id, action) {
    setBusy(id)
    try {
      await api(`/entity-delete-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      toast.success(action === 'approve' ? 'Delete request approved' : 'Delete request rejected')
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 font-semibold">Delete Requests</div>
      {loading && <div className="text-sm text-zinc-500">Loading requests...</div>}
      {!loading && requests.length === 0 && <div className="text-sm text-zinc-600">No pending requests.</div>}
      <div className="space-y-3">
        {requests.map(r => (
          <div key={r.id} className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100 truncate">
                {r.display_title || (r.job_card_id ? `${r.job_card_id} • ${r.field_name || 'Field Plot'} • ${r.category || 'Stand Count'}` : `${r.entity_type} • ${r.entity_id?.slice(0, 8)}`)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Requested by {r.requested_by_username} ({r.requested_by_role}) · {new Date(r.created_at).toLocaleString()}</div>
              {r.reason && <div className="text-xs text-zinc-400 mt-1">Reason: {r.reason}</div>}
            </div>
            {canReview && (
              <div className="flex items-center gap-2 shrink-0">
                <Btn size="sm" variant="danger" disabled={busy === r.id} onClick={() => resolve(r.id, 'approve')}>Approve</Btn>
                <Btn size="sm" variant="ghost" disabled={busy === r.id} onClick={() => resolve(r.id, 'reject')}>Reject</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

export default EntityDeleteRequestsTab
