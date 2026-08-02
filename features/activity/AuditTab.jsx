import React from 'react'
import GlassCard from '@/components/ui/GlassCard'

export function AuditTab({ logs = [] }) {
  const rows = (logs || []).map((l) => {
    let actionText = l.action_desc
    try {
      const parsed = JSON.parse(l.action_desc)
      actionText = parsed?.desc || l.action_desc
    } catch {
      actionText = l.action_desc
    }
    return { ...l, actionText }
  })

  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 font-semibold">System audit log (immutable)</div>
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-600">No events yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900/70 border-b border-zinc-800/60">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400">Time</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400">User</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400">Project</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/40 last:border-0">
                  <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{new Date(row.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">{row.username || 'system'}</td>
                  <td className="px-3 py-2 text-zinc-500 font-mono whitespace-nowrap">{row.project_id ? row.project_id.slice(0, 8) : '-'}</td>
                  <td className="px-3 py-2 text-zinc-200">{row.actionText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

export default AuditTab
