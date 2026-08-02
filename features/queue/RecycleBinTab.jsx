import React, { useState } from 'react'
import { toast } from 'sonner'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function RecycleBinTab({ items = [], onRefresh }) {
  const [restoring, setRestoring] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])

  const activeItems = (items || []).filter((item) => !item.restored_at)
  const allSelected = activeItems.length > 0 && selectedIds.length === activeItems.length

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : activeItems.map((i) => i.id))
  }

  async function restoreItem(id) {
    setRestoring(id)
    try {
      await api(`/recycle-bin/${id}/restore`, { method: 'POST' })
      toast.success('Item restored')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setRestoring(null)
    }
  }

  async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this permanently? This action cannot be undone.')) return
    setDeleting(id)
    try {
      await api(`/recycle-bin/${id}`, { method: 'DELETE' })
      toast.success('Item permanently deleted')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(null)
    }
  }

  async function bulkRestore() {
    if (selectedIds.length === 0) return
    try {
      await Promise.all(selectedIds.map((id) => api(`/recycle-bin/${id}/restore`, { method: 'POST' })))
      toast.success(`${selectedIds.length} item(s) restored`)
      setSelectedIds([])
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return
    if (!confirm(`Delete ${selectedIds.length} selected item(s) permanently? This action cannot be undone.`)) return
    try {
      await Promise.all(selectedIds.map((id) => api(`/recycle-bin/${id}`, { method: 'DELETE' })))
      toast.success(`${selectedIds.length} item(s) permanently deleted`)
      setSelectedIds([])
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Recycle Bin</div>
        {activeItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              {allSelected ? 'Unselect All' : 'Select All'}
            </button>
            <Btn variant="ghost" size="sm" disabled={selectedIds.length === 0} onClick={bulkRestore}>Restore Selected</Btn>
            <Btn variant="danger" size="sm" disabled={selectedIds.length === 0} onClick={bulkDelete}>Delete Selected</Btn>
          </div>
        )}
      </div>
      {items.length === 0 && <div className="text-sm text-zinc-600">Bin is empty.</div>}
      <div className="space-y-3">
        {items.map(item => {
          const payload = item.payload || {}
          const label = payload.name || payload.title || payload.username || payload.id || item.entity_id
          const restored = !!item.restored_at
          return (
            <div key={item.id} className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 gap-3">
              <div className="min-w-0 flex items-start gap-3">
                {!restored && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="mt-1"
                  />
                )}
                <div>
                <div className="font-medium text-zinc-100 truncate">{label}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {item.entity_type} · deleted by {item.deleted_by_username || 'system'} · {new Date(item.deleted_at).toLocaleString()}
                </div>
                {restored && (
                  <div className="text-[11px] text-emerald-300 mt-1">
                    Restored by {item.restored_by_username || 'system'} · {new Date(item.restored_at).toLocaleString()}
                  </div>
                )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Btn
                  variant="ghost"
                  size="sm"
                  disabled={restored || restoring === item.id || deleting === item.id}
                  onClick={() => restoreItem(item.id)}
                >
                  {restored ? 'Restored' : restoring === item.id ? 'Restoring...' : 'Restore'}
                </Btn>
                {!restored && (
                  <Btn
                    variant="danger"
                    size="sm"
                    disabled={restoring === item.id || deleting === item.id}
                    onClick={() => deleteItem(item.id)}
                  >
                    {deleting === item.id ? 'Deleting...' : 'Delete'}
                  </Btn>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

export default RecycleBinTab
