import React, { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { X, Download, FileText, FileCheck } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StageChip from '@/components/ui/StageChip'
import { toUiJobStage } from '@/utils/formatters'

export function ProjectTrackerTab({ project, jobs = [], canExport }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [sortColumn, setSortColumn] = useState('field_name')
  const [sortDirection, setSortDirection] = useState('asc')

  function fmtDate(value) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString()
  }

  function fmtDateTime(value) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString()
  }

  const rows = useMemo(() => {
    const list = []
    for (const j of (jobs || [])) {
      const cat = j.category || 'Stand Count'
      const rawStage = cat === 'Uniformity' ? (j.uni_status || 'Pending') : (j.sc_status || 'Pending')
      const stage = toUiJobStage(rawStage === 'Blocked' ? 'Cancelled' : rawStage)
      list.push({
        id: j.id,
        field_name: j.title || 'Untitled',
        category: cat,
        captured_date: fmtDate(j.capture_date),
        uploaded_date: fmtDateTime(j.created_at),
        uploaded_by: j.created_by_name || '-',
        assigned_to: j.assigned_to_name || 'Unassigned',
        stage: stage,
        delivery_date: stage === 'Done' ? fmtDate(j.updated_at || j.created_at) : '-',
      })
    }
    return list
  }, [jobs])

  const assigneeOptions = useMemo(() => {
    const vals = new Set()
    for (const r of rows) {
      if (r.assigned_to && r.assigned_to !== 'Unassigned' && r.assigned_to !== '-') {
        vals.add(r.assigned_to)
      }
    }
    return [...vals].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!r.field_name.toLowerCase().includes(q) && !r.assigned_to.toLowerCase().includes(q)) return false
      }
      if (categoryFilter !== 'all') {
        if (r.category !== categoryFilter) return false
      }
      if (stageFilter !== 'all') {
        if (r.stage !== stageFilter) return false
      }
      if (assigneeFilter !== 'all') {
        if (r.assigned_to !== assigneeFilter) return false
      }
      return true
    })
  }, [rows, search, categoryFilter, stageFilter, assigneeFilter])

  const sortedRows = useMemo(() => {
    const list = [...filteredRows]
    list.sort((a, b) => {
      let valA = a[sortColumn] || ''
      let valB = b[sortColumn] || ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredRows, sortColumn, sortDirection])

  function handleSort(col) {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  function SortIcon({ col }) {
    if (sortColumn !== col) return <span className="text-zinc-600 ml-1">↕</span>
    return sortDirection === 'asc' ? <span className="text-zinc-300 ml-1">▲</span> : <span className="text-zinc-300 ml-1">▼</span>
  }

  function trackerRows(items) {
    return items.map(r => [
      `"${(r.field_name || '').replace(/"/g, '""')}"`,
      `"${(r.category || '').replace(/"/g, '""')}"`,
      r.captured_date,
      r.uploaded_date,
      `"${(r.uploaded_by || '').replace(/"/g, '""')}"`,
      `"${(r.assigned_to || '').replace(/"/g, '""')}"`,
      r.stage,
      r.delivery_date,
    ])
  }

  function downloadCSV() {
    const headers = ['Field Name', 'Category', 'Captured Date', 'Uploaded Date', 'Uploaded By', 'Assigned To', 'Staged', 'Delivery Date']
    const csv = [headers.join(','), ...trackerRows(sortedRows).map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(project?.name || 'project').replace(/\s+/g, '_')}_tracker_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  function downloadExcel() {
    const headers = ['Field Name', 'Category', 'Captured Date', 'Uploaded Date', 'Uploaded By', 'Assigned To', 'Staged', 'Delivery Date']
    const dataRows = trackerRows(sortedRows).map(r => r.map(v => String(v || '').replace(/^"|"$/g, '')))
    const table = `
      <table border="1">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${dataRows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    `
    const blob = new Blob([table], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(project?.name || 'project').replace(/\s+/g, '_')}_tracker_${new Date().toISOString().slice(0,10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel downloaded')
  }

  function downloadPDF() {
    const headers = ['Field Name', 'Category', 'Captured Date', 'Uploaded Date', 'Uploaded By', 'Assigned To', 'Staged', 'Delivery Date']
    const html = `
      <html><head><title>${project?.name || 'Project'} Tracker</title>
      <style>
        body{font-family:Arial,sans-serif;padding:16px}
        h2{margin:0 0 12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #999;padding:6px;text-align:left}
        th{background:#efefef}
      </style></head><body>
        <h2>${project?.name || 'Project'} - Project Tracker</h2>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sortedRows.map(r => `<tr>
              <td>${r.field_name}</td>
              <td>${r.category}</td>
              <td>${r.captured_date}</td>
              <td>${r.uploaded_date}</td>
              <td>${r.uploaded_by}</td>
              <td>${r.assigned_to}</td>
              <td>${r.stage}</td>
              <td>${r.delivery_date}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `
    const w = window.open('', '_blank', 'width=1100,height=760')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
    toast.success('PDF print triggered')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-zinc-950/20 p-3 rounded-xl border border-zinc-800/40">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search field name or assignee..."
              className="w-full h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-8 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer">
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="Stand Count">Stand Count</option>
            <option value="Uniformity">Uniformity</option>
          </select>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Stages</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Assignees</option>
            <option value="Unassigned">Unassigned</option>
            {assigneeOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {canExport && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={downloadCSV}
              className="flex items-center gap-2 px-3 h-8 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
              <Download size={12} /> CSV
            </button>
            <button onClick={downloadExcel}
              className="flex items-center gap-2 px-3 h-8 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
              <FileText size={12} /> Excel
            </button>
            <button onClick={downloadPDF}
              className="flex items-center gap-2 px-3 h-8 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
              <FileCheck size={12} /> PDF
            </button>
          </div>
        )}
      </div>

      <GlassCard className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-zinc-500 text-sm">No tracker rows yet.</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-10 text-center text-zinc-500 text-sm">No matching tracker rows.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-950/80 border-b border-zinc-800/60 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('field_name')}>
                    Field Name <SortIcon col="field_name" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('category')}>
                    Category <SortIcon col="category" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('captured_date')}>
                    Captured Date <SortIcon col="captured_date" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('uploaded_date')}>
                    Uploaded Date <SortIcon col="uploaded_date" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('uploaded_by')}>
                    Uploaded By <SortIcon col="uploaded_by" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('assigned_to')}>
                    Assigned to <SortIcon col="assigned_to" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('stage')}>
                    Stage <SortIcon col="stage" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('delivery_date')}>
                    Delivery Date <SortIcon col="delivery_date" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.id || i} className="border-t border-zinc-800/40 bg-zinc-950/50 hover:bg-white/[0.01] transition-colors">
                    <td className="px-4 py-3 text-zinc-200 font-medium">{r.field_name}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        r.category === 'Uniformity'
                          ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{r.captured_date}</td>
                    <td className="px-4 py-3 text-zinc-400">{r.uploaded_date}</td>
                    <td className="px-4 py-3 text-zinc-300">{r.uploaded_by}</td>
                    <td className="px-4 py-3 text-zinc-300">{r.assigned_to}</td>
                    <td className="px-4 py-3"><StageChip status={r.stage} /></td>
                    <td className="px-4 py-3 text-zinc-400">{r.delivery_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

export default ProjectTrackerTab
