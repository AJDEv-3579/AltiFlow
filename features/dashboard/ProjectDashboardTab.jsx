import React, { useState, useMemo } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { Star } from 'lucide-react'
import { getJobPipelineStage } from '@/utils/formatters'
import { timeAgo } from '@/utils/date'
import JobCardDetailModal from '../jobs/JobCardDetailModal'

export function ProjectDashboardTab({
  project,
  jobs = [],
  teamMembers = [],
  user,
  orgUsers = [],
  onRefresh,
  isAdmin,
  onOpenJobDetail,
  isSuperAdmin = false,
  adminAssignments = [],
}) {
  const [selectedJobModal, setSelectedJobModal] = useState(null)

  const total = jobs.length
  const doneCount = jobs.filter(j => getJobPipelineStage(j) === 'Done').length
  const inProgressCount = jobs.filter(j => getJobPipelineStage(j) === 'In Progress').length
  const pendingCount = jobs.filter(j => getJobPipelineStage(j) === 'Pending').length
  const cancelledCount = jobs.filter(j => getJobPipelineStage(j) === 'Cancelled').length
  const validTotal = Math.max(1, total - cancelledCount)
  const overallProgressPct = total > 0 ? Math.round((doneCount / validTotal) * 100) : 0

  const categorySummary = useMemo(() => {
    const catMap = {}
    jobs.forEach(j => {
      const cat = j.category || 'Uncategorised'
      if (!catMap[cat]) catMap[cat] = { category: cat, total: 0, done: 0, inProgress: 0, pending: 0, cancelled: 0 }
      catMap[cat].total += 1
      const st = getJobPipelineStage(j)
      if (st === 'Done') catMap[cat].done += 1
      else if (st === 'In Progress') catMap[cat].inProgress += 1
      else if (st === 'Cancelled') catMap[cat].cancelled += 1
      else catMap[cat].pending += 1
    })
    return Object.values(catMap).map(c => ({
      ...c,
      pct: c.total > 0 ? Math.round((c.done / Math.max(1, c.total - c.cancelled)) * 100) : 0
    }))
  }, [jobs])

  const statusPieData = useMemo(() => [
    { name: 'Done', value: doneCount, color: '#10b981' },
    { name: 'In Progress', value: inProgressCount, color: '#3b82f6' },
    { name: 'Pending', value: pendingCount, color: '#f59e0b' },
    { name: 'Cancelled', value: cancelledCount, color: '#ef4444' },
  ].filter(d => d.value > 0), [doneCount, inProgressCount, pendingCount, cancelledCount])

  const jobsOverTimeData = useMemo(() => {
    const windowWeeks = 8
    const startOfWeek = (value) => {
      const d = new Date(value)
      if (isNaN(d.getTime())) return null
      d.setHours(0, 0, 0, 0)
      const day = d.getDay()
      const diff = day === 0 ? -6 : (1 - day)
      d.setDate(d.getDate() + diff)
      return d
    }

    const toWeekKey = (value) => {
      const d = new Date(value)
      if (isNaN(d.getTime())) return null
      const sow = startOfWeek(d)
      return `${sow.getFullYear()}-${String(sow.getMonth() + 1).padStart(2, '0')}-${String(sow.getDate()).padStart(2, '0')}`
    }

    const latestProjectEventTs = jobs.reduce((maxTs, job) => {
      const createdTs = new Date(job.created_at || 0).getTime()
      const deliveredValue = job.delivery_confirmed_at || job.delivered_at || (getJobPipelineStage(job) === 'Done' ? job.updated_at : null)
      const deliveredTs = new Date(deliveredValue || 0).getTime()
      const candidate = Math.max(Number.isNaN(createdTs) ? 0 : createdTs, Number.isNaN(deliveredTs) ? 0 : deliveredTs)
      return Math.max(maxTs, candidate)
    }, 0)

    const anchorDate = latestProjectEventTs > 0 ? new Date(latestProjectEventTs) : new Date()
    anchorDate.setHours(0, 0, 0, 0)

    const anchorWeekStart = startOfWeek(anchorDate)
    const start = new Date(anchorWeekStart)
    start.setDate(start.getDate() - ((windowWeeks - 1) * 7))

    const buckets = {}
    for (let i = 0; i < windowWeeks; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + (i * 7))
      const key = toWeekKey(d)
      const weekEnd = new Date(d)
      weekEnd.setDate(d.getDate() + 6)
      buckets[key] = {
        key,
        date: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        total: 0,
        done: 0,
        ts: d.getTime(),
      }
    }

    jobs.forEach((job) => {
      const createdKey = toWeekKey(job.created_at)
      if (createdKey && buckets[createdKey]) {
        buckets[createdKey].total += 1
      }

      if (getJobPipelineStage(job) === 'Done') {
        const deliveredAt = job.delivery_confirmed_at || job.delivered_at || job.updated_at || job.created_at
        const deliveredKey = toWeekKey(deliveredAt)
        if (deliveredKey && buckets[deliveredKey]) {
          buckets[deliveredKey].done += 1
        }
      }
    })

    return Object.values(buckets).sort((a, b) => a.ts - b.ts)
  }, [jobs])

  const orgUserMap = useMemo(() => {
    const m = {}
    ;(orgUsers || []).forEach(u => { if (u.id) m[u.id] = u })
    return m
  }, [orgUsers])

  const isClientRole = (role) => role === 'Client-Admin' || role === 'Client-User'

  const priorityFields = useMemo(() =>
    [...jobs]
      .filter(j => j.is_priority === true)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  , [jobs])

  const userActivities = useMemo(() => {
    const activities = []

    jobs.forEach(j => {
      const logs = j.comments_log || []
      logs.forEach(c => {
        const orgU = orgUserMap[c.user_id]
        const role = orgU?.role || null
        if (!role || !isClientRole(role)) return
        activities.push({
          id: c.id || `c-${Math.random()}`,
          user: c.username || orgU?.username || 'Client User',
          role,
          type: 'comment',
          text: `${c.stage === 'Created' ? 'created job card' : `commented on`} ${j.title || 'Job'} [${j.category || 'Stand Count'}]${c.stage && c.stage !== 'Created' ? ` — ${c.comment}` : ''}`,
          job: j,
          timestamp: new Date(c.created_at || Date.now()).getTime(),
        })
      })

      if (j.created_at && j.created_by) {
        const creatorUser = orgUserMap[j.created_by]
        if (creatorUser && isClientRole(creatorUser.role)) {
          activities.push({
            id: `created-${j.id}`,
            user: creatorUser.username || j.created_by_name || 'Client User',
            role: creatorUser.role,
            type: 'created',
            text: `uploaded field data for ${j.title || 'Field Plot'} [${j.category || 'Stand Count'}]`,
            job: j,
            timestamp: new Date(j.created_at).getTime(),
          })
        }
      }
    })

    const seen = new Set()
    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter(act => { if (seen.has(act.id)) return false; seen.add(act.id); return true })
      .slice(0, 20)
  }, [jobs, orgUserMap])

  const recentJobs = useMemo(() =>
    [...jobs].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 8)
  , [jobs])

  const projectAwareAdminAssignments = useMemo(() => {
    if (!isSuperAdmin || !project?.id) return adminAssignments || []
    return (adminAssignments || [])
      .map((admin) => {
        const projectStats = admin?.projects?.[project.id]
        if (!projectStats) return null
        return {
          ...admin,
          total_jobs: projectStats.total_jobs || 0,
          sc_count: projectStats.sc_count || 0,
          uni_count: projectStats.uni_count || 0,
          done_count: projectStats.done_count || 0,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.total_jobs - a.total_jobs)
  }, [isSuperAdmin, project?.id, adminAssignments])

  const tt = { backgroundColor: '#0f0f11', border: '1px solid #27272a', borderRadius: '10px', fontSize: 12, color: '#e4e4e7' }
  const pct80 = overallProgressPct >= 80
  const pct40 = overallProgressPct >= 40
  const ringColor = pct80 ? '#10b981' : pct40 ? '#3b82f6' : '#f59e0b'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* PROJECT SUMMARY HEADER */}
      <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7' }}>Project Summary</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)', borderRadius: '10px', padding: '4px 14px' }}>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#818cf8', lineHeight: 1 }}>{total}</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Jobs</span>
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#71717a' }}>{project ? project.name : 'Project Workspace'}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '28px', alignItems: 'center' }}>
          {/* Circular Gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{ position: 'relative', width: '110px', height: '110px' }}>
              <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="55" cy="55" r="46" fill="none" stroke="#1e1e22" strokeWidth="9" />
                <circle cx="55" cy="55" r="46" fill="none" stroke={ringColor} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${(overallProgressPct / 100) * 289} 289`}
                  style={{ transition: 'stroke-dasharray 0.8s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-1.5px', lineHeight: 1 }}>{overallProgressPct}%</span>
                <span style={{ fontSize: '9px', color: '#52525b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</span>
              </div>
            </div>
            
            <div style={{ textAlign: 'center', marginTop: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>{doneCount}</span>
              <span style={{ fontSize: '11px', color: '#52525b' }}> of {total} delivered</span>
            </div>
          </div>

          {/* Stage Progress Bar & Cards */}
          <div>
            <div style={{ display: 'flex', height: '8px', borderRadius: '99px', overflow: 'hidden', gap: '2px', background: '#1e1e22', marginBottom: '16px' }}>
              {total > 0 && [
                { count: doneCount,       color: '#10b981' },
                { count: inProgressCount, color: '#3b82f6' },
                { count: pendingCount,    color: '#f59e0b' },
                { count: cancelledCount,  color: '#ef4444' },
              ].filter(s => s.count > 0).map((s, i) => (
                <div key={i} style={{ height: '100%', width: `${(s.count / total) * 100}%`, background: s.color, transition: 'width 0.6s ease' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Done',        count: doneCount,       color: '#10b981', bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.2)'  },
                { label: 'In Progress', count: inProgressCount, color: '#3b82f6', bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.2)'  },
                { label: 'Pending',     count: pendingCount,    color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)' },
                { label: 'Cancelled',   count: cancelledCount,  color: '#ef4444', bg: 'rgba(239,68,68,0.07)',  border: 'rgba(239,68,68,0.2)'  },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-1px' }}>{s.count}</div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '5px' }}>{s.label}</div>
                  <div style={{ fontSize: '10px', color: '#3f3f46', marginTop: '2px' }}>
                    {total > 0 ? `${Math.round((s.count / total) * 100)}%` : '0%'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2 CHARTS */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '12px' }}>
        {/* CHART 1: Donut */}
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '22px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7', marginBottom: '2px' }}>Job Status</div>
          <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '14px' }}>Pipeline distribution</div>
          {statusPieData.length === 0 ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontSize: '12px' }}>No jobs yet</div>
          ) : (
            <div style={{ height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tt} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '14px' }}>
            {statusPieData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{d.name}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#d4d4d8' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CHART 2: Jobs Over Time */}
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '22px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7', marginBottom: '2px' }}>Jobs Over Time</div>
          <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '14px' }}>Created vs delivered by date</div>
          {jobsOverTimeData.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontSize: '12px' }}>No date data</div>
          ) : (
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={jobsOverTimeData} margin={{ left: -10, right: 6, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashGD" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1c1c20" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="date" stroke="#3f3f46" tick={{ fill: '#52525b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="#3f3f46" tick={{ fill: '#52525b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tt} />
                  <Area type="monotone" dataKey="total" name="Created" stroke="#3b82f6" strokeWidth={2} fill="url(#dashGT)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="done" name="Delivered" stroke="#10b981" strokeWidth={2} fill="url(#dashGD)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
            {[{ label: 'Created', color: '#3b82f6' }, { label: 'Delivered', color: '#10b981' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '18px', height: '2px', background: l.color, borderRadius: '1px' }} />
                <span style={{ fontSize: '11px', color: '#52525b' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CATEGORIES TABLE */}
      {categorySummary.length > 0 && (
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '22px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7', marginBottom: '2px' }}>Categories</div>
          <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '18px' }}>Delivery status per analysis type</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e22' }}>
                {['Category', 'Total', 'Done', 'In Progress', 'Pending', 'Cancelled', 'Delivery'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Category' ? 'left' : 'center', padding: '0 12px 10px', fontSize: '10px', fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categorySummary.map((cat, i) => (
                <tr key={cat.category} style={{ borderBottom: i < categorySummary.length - 1 ? '1px solid #18181b' : 'none' }}>
                  <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600, color: '#d4d4d8' }}>{cat.category}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#a1a1aa' }}>{cat.total}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#10b981' }}>{cat.done}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#3b82f6' }}>{cat.inProgress}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{cat.pending}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{cat.cancelled}</td>
                  <td style={{ padding: '12px', minWidth: '120px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '5px', background: '#1e1e22', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cat.pct}%`, background: cat.pct >= 80 ? '#10b981' : cat.pct >= 40 ? '#3b82f6' : '#f59e0b', borderRadius: '99px', transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#71717a', minWidth: '32px', textAlign: 'right' }}>{cat.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PRIORITY FIELDS (SCROLLABLE) + PROJECT USER ACTIVITY LOG */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Priority Fields List (Scrollable) */}
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7' }}>Priority Fields</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '99px', padding: '2px 8px' }}>
              {priorityFields.length > 0 ? `${priorityFields.length} Starred` : 'None Starred'}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '14px' }}>Priority field Jobs List — starred ★ job cards</div>

          {priorityFields.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>☆</div>
              <div style={{ fontSize: '12px', color: '#52525b' }}>No priority jobs yet</div>
              <div style={{ fontSize: '11px', color: '#3f3f46', marginTop: '4px' }}>Star a job card in the Job Cards tab to flag it as priority</div>
            </div>
          ) : (
            <div style={{ maxHeight: '270px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {priorityFields.map(job => {
                const stage = getJobPipelineStage(job)
                const jcId = `JC-${(job.id || '').slice(0, 6).toUpperCase()}`

                return (
                  <div key={job.id}
                    onClick={() => { if (onOpenJobDetail) onOpenJobDetail(job); else setSelectedJobModal(job) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#16161a', border: '1px solid #1e1e22', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#27272a'; e.currentTarget.style.background = '#1a1a20' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e22'; e.currentTarget.style.background = '#16161a' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <Star size={14} className="text-amber-400 fill-amber-400 shrink-0" />
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#818cf8', flexShrink: 0 }}>{jcId}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.title || job.field_name || '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#52525b' }}>{job.category || '—'}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#71717a', fontWeight: 600 }}>{stage}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Project User Activity Log (Client Admins & Client Users ONLY) */}
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7' }}>Project User Activity Log</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '99px', padding: '2px 8px' }}>
              Live Log
            </div>
          </div>

          {userActivities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#3f3f46', fontSize: '12px' }}>No client user activity logged yet</div>
          ) : (
            <div style={{ maxHeight: '270px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {userActivities.map(act => (
                <div key={act.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 10px', background: '#16161a', border: '1px solid #1c1c20', borderRadius: '10px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#a5b4fc', flexShrink: 0, marginTop: '2px' }}>
                    {(act.user || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#d4d4d8' }}>{act.user}</span>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#71717a', background: '#212126', border: '1px solid #27272a', borderRadius: '4px', padding: '1px 5px' }}>{act.role}</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#52525b', flexShrink: 0 }}>{timeAgo(act.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {act.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* RECENT JOBS TABLE */}
      <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '22px 24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7', marginBottom: '2px' }}>Recent Jobs</div>
        <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '18px' }}>Latest activity — click to open details</div>
        {recentJobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#3f3f46', fontSize: '13px' }}>No job cards created yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e22' }}>
                {['Job ID', 'Field Name', 'Category', 'Status', 'Assigned To', 'Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 12px 10px', fontSize: '10px', fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job, i) => {
                const stage = getJobPipelineStage(job)
                const jcId = `JC-${(job.id || '').slice(0, 6).toUpperCase()}`
                const sc = stage === 'Done' ? { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)' }
                  : stage === 'In Progress' ? { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' }
                  : stage === 'Cancelled' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' }
                  : { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' }
                return (
                  <tr key={job.id}
                    onClick={() => { if (onOpenJobDetail) onOpenJobDetail(job); else setSelectedJobModal(job) }}
                    style={{ borderBottom: i < recentJobs.length - 1 ? '1px solid #18181b' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#15151a'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '11px 12px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#818cf8' }}>{jcId}</td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: '#d4d4d8', fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title || job.field_name || '—'}</td>
                    <td style={{ padding: '11px 12px', fontSize: '12px', color: '#71717a' }}>{job.category || '—'}</td>
                    <td style={{ padding: '11px 12px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '3px 8px', borderRadius: '99px', background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>{stage}</span>
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '12px', color: '#52525b' }}>{job.assigned_to_name || 'Unassigned'}</td>
                    <td style={{ padding: '11px 12px', fontSize: '12px', color: '#3f3f46' }}>{new Date(job.updated_at || job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {isSuperAdmin && projectAwareAdminAssignments.length > 0 && (
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: '16px', padding: '22px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7', marginBottom: '2px' }}>Admin Job Card Distribution</div>
          <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '14px' }}>Live admin-wise workload and delivery for this project</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e1e22' }}>
                  {['Admin Name', 'Total Jobs', 'Stand Count', 'Uniformity', 'Delivered'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Admin Name' ? 'left' : 'center', padding: '0 12px 10px', fontSize: '10px', fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projectAwareAdminAssignments.map((admin, i) => {
                  const deliveryRate = admin.total_jobs > 0 ? Math.round((admin.done_count / admin.total_jobs) * 100) : 0
                  return (
                    <tr key={admin.admin_id || i} style={{ borderBottom: i < projectAwareAdminAssignments.length - 1 ? '1px solid #18181b' : 'none' }}>
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: 600, color: '#d4d4d8' }}>{admin.admin_name}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#c4b5fd' }}>{admin.total_jobs}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#93c5fd' }}>{admin.sc_count}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#fde047' }}>{admin.uni_count}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#5eead4' }}>{admin.done_count}</div>
                        <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>{deliveryRate}%</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedJobModal && (
          <JobCardDetailModal
            job={selectedJobModal}
            project={project}
            orgUsers={orgUsers || []}
            onClose={() => setSelectedJobModal(null)}
            onRefresh={onRefresh}
            isAdmin={isAdmin}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProjectDashboardTab
