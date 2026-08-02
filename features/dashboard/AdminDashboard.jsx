import React from 'react'
import { Package, Building2, ClipboardList, ShieldAlert } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StatCard from '@/components/ui/StatCard'

const STATUS_COLORS = {
  'Pending': { bg: 'from-blue-500/10 to-blue-500/5', text: 'text-blue-300', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  'In-Download': { bg: 'from-cyan-500/10 to-cyan-500/5', text: 'text-cyan-300', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  'QC': { bg: 'from-violet-500/10 to-violet-500/5', text: 'text-violet-300', border: 'border-violet-500/30', dot: 'bg-violet-500' },
  'Processing': { bg: 'from-amber-500/10 to-amber-500/5', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  'Delivery': { bg: 'from-emerald-500/10 to-emerald-500/5', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  'Failed_Refly': { bg: 'from-red-600/15 to-red-600/5', text: 'text-red-300', border: 'border-red-500/50', dot: 'bg-red-500' },
}

export function AdminDashboard({ analytics, data, projects, clientProjects, clients, onClick, onOpenWorkspace, onNavigateProject, onRefresh, user, onSwitchTab }) {
  const activeAnalytics = analytics || data?.analytics || (data?.totals ? data : null)
  if (!activeAnalytics) return <div className="text-sm text-zinc-500 py-10 text-center">Loading dashboard analytics…</div>
  const safeBySla = activeAnalytics.bySla || { ok: 0, warning: 0, breached: 0 }
  const safeByStatus = activeAnalytics.byStatus || {}
  const safeByClient = activeAnalytics.byClient || []
  const workspaceCount = activeAnalytics.totals?.client_workspaces ?? activeAnalytics.totals?.projects ?? 0
  const jobCardStats = activeAnalytics.jobCardStats || { stand_count: { total: 0, done: 0, in_progress: 0, blocked: 0, need_delivery: 0 }, uniformity: { total: 0, done: 0, in_progress: 0, blocked: 0, need_delivery: 0 } }
  const adminAssignments = activeAnalytics.adminAssignments || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package} label="Client Workspaces" value={workspaceCount} tone="blue" onClick={() => onSwitchTab?.('projects')} />
        <StatCard icon={Building2} label="Clients" value={activeAnalytics.totals?.clients || 0} tone="emerald" onClick={() => onSwitchTab?.('clients')} />
        <StatCard icon={ClipboardList} label="Field Jobs" value={activeAnalytics.totals?.field_jobs || 0} tone="violet" />
        <StatCard icon={ShieldAlert} label="Refly Flags" value={activeAnalytics.totals?.refly || 0} tone="red" />
      </div>

      {/* Job Card Stats - Stand Count & Uniformity */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Stand Count Stats */}
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400" />Stand Count Jobs
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total Created</span>
              <span className="text-2xl font-bold text-violet-300">{jobCardStats.stand_count?.total || 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <div className="text-emerald-400 font-semibold text-lg">{jobCardStats.stand_count?.done || 0}</div>
                <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">Delivered</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-blue-400 font-semibold text-lg">{jobCardStats.stand_count?.in_progress || 0}</div>
                <div className="text-blue-400/60 text-[10px] uppercase tracking-wider">In Progress</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="text-amber-400 font-semibold text-lg">{jobCardStats.stand_count?.need_delivery || 0}</div>
                <div className="text-amber-400/60 text-[10px] uppercase tracking-wider">To Deliver</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-red-400 font-semibold text-lg">{jobCardStats.stand_count?.blocked || 0}</div>
                <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Blocked</div>
              </div>
            </div>
            {jobCardStats.stand_count?.total > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-[10px] text-zinc-500">Completion Rate</div>
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round((jobCardStats.stand_count?.done / jobCardStats.stand_count?.total) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Uniformity Stats */}
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />Uniformity Jobs
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total Created</span>
              <span className="text-2xl font-bold text-amber-300">{jobCardStats.uniformity?.total || 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <div className="text-emerald-400 font-semibold text-lg">{jobCardStats.uniformity?.done || 0}</div>
                <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">Delivered</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-blue-400 font-semibold text-lg">{jobCardStats.uniformity?.in_progress || 0}</div>
                <div className="text-blue-400/60 text-[10px] uppercase tracking-wider">In Progress</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="text-amber-400 font-semibold text-lg">{jobCardStats.uniformity?.need_delivery || 0}</div>
                <div className="text-amber-400/60 text-[10px] uppercase tracking-wider">To Deliver</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-red-400 font-semibold text-lg">{jobCardStats.uniformity?.blocked || 0}</div>
                <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Blocked</div>
              </div>
            </div>
            {jobCardStats.uniformity?.total > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-[10px] text-zinc-500">Completion Rate</div>
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round((jobCardStats.uniformity?.done / jobCardStats.uniformity?.total) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">SLA Health</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
              <div className="text-xs text-emerald-300 mb-1">On track</div>
              <div className="text-2xl font-mono">{safeBySla.ok}</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
              <div className="text-xs text-amber-300 mb-1">Warning (&lt;4h)</div>
              <div className="text-2xl font-mono">{safeBySla.warning}</div>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/40 p-4">
              <div className="text-xs text-red-300 mb-1">Breached</div>
              <div className="text-2xl font-mono">{safeBySla.breached}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">By status</div>
            <div className="space-y-2">
              {Object.entries(safeByStatus).map(([k, v]) => {
                const total = Object.values(safeByStatus).reduce((a, b) => a + b, 0) || 1
                const pct = (v / total) * 100
                return (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[k]?.dot || 'bg-zinc-500'}`} />
                    <div className="w-32 text-zinc-300">{k}</div>
                    <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div className={`h-full ${STATUS_COLORS[k]?.dot || 'bg-zinc-500'}`} style={{ width: pct + '%' }} />
                    </div>
                    <div className="font-mono text-xs text-zinc-400 w-8 text-right">{v}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Clients</div>
          <div className="space-y-2">
            {safeByClient.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{c.name}</span>
                <span className="font-mono text-zinc-400">{c.count}</span>
              </div>
            ))}
            {safeByClient.length === 0 && <div className="text-xs text-zinc-600">No clients yet.</div>}
          </div>
        </GlassCard>
      </div>

      {/* Admin Assignments - Super Admin Only */}
      {adminAssignments && adminAssignments.length > 0 && (
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Admin Job Card Distribution</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-500">
                  <th className="text-left py-2 px-3">Admin Name</th>
                  <th className="text-center py-2 px-3">Total Jobs</th>
                  <th className="text-center py-2 px-3">Stand Count</th>
                  <th className="text-center py-2 px-3">Uniformity</th>
                  <th className="text-center py-2 px-3">Delivered</th>
                  <th className="text-center py-2 px-3">Projects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {adminAssignments.map(admin => {
                  const projectCount = Object.keys(admin.projects || {}).length
                  const deliveryRate = admin.total_jobs > 0 ? Math.round((admin.done_count / admin.total_jobs) * 100) : 0
                  return (
                    <tr key={admin.admin_id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-3 font-medium text-zinc-100">{admin.admin_name}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-violet-300">{admin.total_jobs}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-blue-300">{admin.sc_count}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-amber-300">{admin.uni_count}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-emerald-300 font-medium">{admin.done_count}</span>
                        <div className="text-[9px] text-zinc-500">{deliveryRate}%</div>
                      </td>
                      <td className="py-3 px-3 text-center text-zinc-400">{projectCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

export default AdminDashboard
