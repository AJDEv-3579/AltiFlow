import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'

export function SupportTicketsTab({ user, project = null }) {
  const isInternal = ['Super-Admin', 'Admin'].includes(user?.role)
  const isSuperAdmin = user?.role === 'Super-Admin'
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: 'Medium' })
  const [expandedTicketId, setExpandedTicketId] = useState(null)
  const [commentsMap, setCommentsMap] = useState({})
  const [timelineMap, setTimelineMap] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [postingComment, setPostingComment] = useState(false)

  async function loadTickets() {
    setLoading(true)
    try {
      const projectQuery = project?.id ? `&project_id=${encodeURIComponent(project.id)}` : ''
      const r = await api(`/support-tickets?limit=80&refresh=1${projectQuery}`)
      const nextTickets = r.tickets || []
      setTickets(nextTickets)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTickets() }, [project?.id])

  async function loadComments(ticketId) {
    try {
      const r = await api(`/support-tickets/${ticketId}/comments`)
      setCommentsMap(prev => ({ ...prev, [ticketId]: r.comments || [] }))
      setTimelineMap(prev => ({ ...prev, [ticketId]: r.timeline || [] }))
    } catch (e) {}
  }

  function toggleExpand(ticketId) {
    if (expandedTicketId === ticketId) {
      setExpandedTicketId(null)
    } else {
      setExpandedTicketId(ticketId)
      loadComments(ticketId)
    }
  }

  async function submitTicket(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) return
    setBusy(true)
    try {
      await api('/support-tickets', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          severity: form.severity,
        }),
      })
      toast.success('Support ticket raised successfully')
      setForm({ title: '', description: '', severity: 'Medium' })
      await loadTickets()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function updateTicket(id, status) {
    try {
      await api(`/support-tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      toast.success(status === 'Open' ? 'Ticket reopened' : `Ticket status updated to ${status}`)
      await loadTickets()
      if (expandedTicketId === id) loadComments(id)
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function postComment(ticketId, parentId = null) {
    const draft = (commentDrafts[ticketId] || '').trim()
    if (!draft) return
    setPostingComment(true)
    try {
      await api(`/support-tickets/${ticketId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: draft, parent_id: parentId }),
      })
      toast.success('Comment added')
      setCommentDrafts(prev => ({ ...prev, [ticketId]: '' }))
      await loadComments(ticketId)
      await loadTickets()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPostingComment(false)
    }
  }

  async function deleteTicket(id) {
    if (!isSuperAdmin) return
    if (!confirm('Delete this support ticket? It can be restored from Bin.')) return
    try {
      await api(`/support-tickets/${id}`, { method: 'DELETE' })
      toast.success('Ticket moved to Bin')
      await loadTickets()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const statusCls = s =>
    s === 'Resolved' || s === 'Closed'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : s === 'In Progress'
        ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'

  const sevCls = s =>
    s === 'Critical'
      ? 'bg-red-500/10 border-red-500/30 text-red-300'
      : s === 'High'
        ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
        : s === 'Medium'
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 font-semibold">Raise App Issue</div>
        <form onSubmit={submitTicket} className="space-y-3">
          <Field label="Issue Title *">
            <TextInput value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g., Upload page freezes after CSV selection" />
          </Field>
          <Field label="Severity">
            <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </Field>
          <Field label="Description *">
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
              placeholder="Describe steps to reproduce and what happened..."
              className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none" />
          </Field>
          <div className="flex justify-end">
            <Btn type="submit" disabled={busy || !form.title.trim() || !form.description.trim()} icon={Bell}>
              {busy ? 'Submitting...' : 'Raise Ticket'}
            </Btn>
          </div>
        </form>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 font-semibold">Support Queue</div>
        {loading ? (
          <div className="text-sm text-zinc-500">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-zinc-600">No support tickets raised yet.</div>
        ) : (
          <div className="space-y-3">
            {tickets.map(t => {
              const isCreator = t.created_by === user?.id
              const canReopen = (t.status === 'Resolved' || t.status === 'Closed') && (isCreator || user?.role === 'Client-Admin' || isInternal)
              const comments = commentsMap[t.id] || t.comments_log || []
              const timeline = timelineMap[t.id] || t.timeline || []
              const isExpanded = expandedTicketId === t.id

              return (
                <div key={t.id} className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-100 flex items-center gap-2 flex-wrap">
                        <span>{t.title}</span>
                        {canReopen && (
                          <button
                            type="button"
                            onClick={() => updateTicket(t.id, 'Open')}
                            className="px-2 py-0.5 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors font-semibold cursor-pointer"
                          >
                            Reopen Ticket
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Raised by <span className="text-zinc-300 font-medium">{t.created_by_name || 'Unknown'}</span>
                        {t.client_name && <span> · {t.client_name}</span>}
                        <span> · {new Date(t.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${sevCls(t.severity)}`}>{t.severity}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${statusCls(t.status)}`}>{t.status}</span>
                    </div>
                  </div>

                  <div className="text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/40">{t.description}</div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(t.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      {isExpanded ? 'Hide Discussion & Timeline' : `View Discussion (${comments.length}) & Timeline`}
                    </button>

                    {isInternal && (
                      <div className="flex items-center gap-2">
                        <select value={t.status} onChange={e => updateTicket(t.id, e.target.value)}
                          className="h-8 bg-zinc-900/70 border border-zinc-800 rounded-lg px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
                          <option>Open</option>
                          <option>In Progress</option>
                          <option>Resolved</option>
                          <option>Closed</option>
                        </select>
                        {isSuperAdmin && (
                          <button onClick={() => deleteTicket(t.id)} className="h-8 px-2 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs cursor-pointer">
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/60 space-y-4">
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Ticket Timeline</div>
                        {timeline.length === 0 ? (
                          <div className="text-xs text-zinc-600">Ticket Created · {new Date(t.created_at).toLocaleString()}</div>
                        ) : (
                          <div className="space-y-1 pl-2 border-l-2 border-zinc-800">
                            {timeline.map((ev, idx) => (
                              <div key={ev.id || idx} className="text-xs flex items-center gap-2 text-zinc-300">
                                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                <span className="font-semibold text-zinc-200">{ev.title}</span>
                                <span className="text-zinc-500">by {ev.username}</span>
                                <span className="text-zinc-600 text-[10px]">· {new Date(ev.timestamp).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Discussion Thread</div>
                        {comments.length === 0 ? (
                          <div className="text-xs text-zinc-600">No comments yet. Start the conversation below.</div>
                        ) : (
                          <div className="space-y-2">
                            {comments.map(c => (
                              <div key={c.id} className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/60 text-xs space-y-1">
                                <div className="flex items-center justify-between text-zinc-400">
                                  <span className="font-semibold text-zinc-200">{c.username} <span className="text-[10px] text-zinc-500 font-normal">({c.role})</span></span>
                                  <span className="text-[10px] text-zinc-500">{new Date(c.created_at).toLocaleString()}</span>
                                </div>
                                <div className="text-zinc-300 whitespace-pre-wrap">{c.comment}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            value={commentDrafts[t.id] || ''}
                            onChange={e => setCommentDrafts(prev => ({ ...prev, [t.id]: e.target.value }))}
                            placeholder="Write a comment or response..."
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) postComment(t.id) }}
                          />
                          <Btn size="sm" disabled={postingComment || !(commentDrafts[t.id] || '').trim()} onClick={() => postComment(t.id)}>
                            {postingComment ? 'Posting...' : 'Comment'}
                          </Btn>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

export default SupportTicketsTab
