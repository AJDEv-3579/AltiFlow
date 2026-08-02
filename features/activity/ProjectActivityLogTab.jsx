import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Clock, RefreshCw, Search } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function ProjectActivityLogTab({ project, user }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [userFilter, setUserFilter] = useState('all')
  const [activityFilter, setActivityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  async function loadLogs() {
    setLoading(true)
    try {
      const url = `/projects/${project.id}/activity-log?user=${userFilter}&activity=${activityFilter}&category=${categoryFilter}`
      const r = await api(url)
      setLogs(r.logs || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs() }, [project.id, userFilter, activityFilter, categoryFilter])

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchUser = (l.username || '').toLowerCase().includes(q)
        const matchDesc = (l.action_desc || '').toLowerCase().includes(q)
        const matchTitle = (l.job_card_id || '').toLowerCase().includes(q)
        const matchField = (l.field_name || '').toLowerCase().includes(q)
        if (!matchUser && !matchDesc && !matchTitle && !matchField) return false
      }
      return true
    })
  }, [logs, search])

  const usersList = useMemo(() => [...new Set(logs.map(l => l.username).filter(Boolean))], [logs])
  const activitiesList = useMemo(() => [...new Set(logs.map(l => l.activity_type || 'General'))], [logs])
  const categoriesList = useMemo(() => [...new Set(logs.map(l => l.category).filter(Boolean))], [logs])

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Clock size={16} className="text-blue-400" />
            Project Activity Console
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Centralized audit trail for all project events</div>
        </div>
        <Btn size="sm" variant="outline" icon={RefreshCw} onClick={loadLogs}>Refresh Console</Btn>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60">
        <div>
          <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Search</label>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search user, job, field..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Filter by User</label>
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer">
            <option value="all">All Users</option>
            {usersList.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Activity Type</label>
          <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer">
            <option value="all">All Activity Types</option>
            {activitiesList.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Category</label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer">
            <option value="all">All Categories</option>
            {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500 text-center py-8">Loading project logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-sm text-zinc-600 text-center py-8">No activity logs recorded matching criteria.</div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map(log => {
            const jcFormatted = log.job_card_id ? `${log.job_card_id} • ${log.field_name || 'Field'} • ${log.category || 'Stand Count'}` : null
            return (
              <div key={log.id} className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-200">{log.username || 'System'}</span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] uppercase font-semibold">
                      {log.activity_type || 'General'}
                    </span>
                    {jcFormatted && (
                      <span className="font-mono text-xs text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/30">
                        {jcFormatted}
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-300">{log.action_desc}</div>
                  {log.details && log.details !== log.action_desc && (
                    <div className="text-zinc-500 text-[11px] font-mono">{log.details}</div>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 shrink-0 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}

export default ProjectActivityLogTab
