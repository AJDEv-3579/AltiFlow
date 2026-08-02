import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, MessageSquare, Ticket, Ban, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import notificationService from '@/services/notificationService'

function getStorageKey(userId) {
  return `altiflow_notifications_state_${userId || 'anonymous'}`
}

function loadLocalState(userId) {
  if (typeof window === 'undefined') return { readIds: [], markAllTs: 0 }
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return { readIds: [], markAllTs: 0 }
    const parsed = JSON.parse(raw)
    return {
      readIds: Array.isArray(parsed?.readIds) ? parsed.readIds : [],
      markAllTs: Number(parsed?.markAllTs || 0),
    }
  } catch {
    return { readIds: [], markAllTs: 0 }
  }
}

function saveLocalState(userId, state) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getStorageKey(userId), JSON.stringify(state))
}

function toTs(value) {
  const ms = new Date(value || 0).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function iconFor(type) {
  if (type === 'job-comment') return MessageSquare
  if (type === 'support-comment') return Ticket
  if (type === 'job-cancelled') return Ban
  if (type === 'support-status') return Ticket
  return Bell
}

function timeAgo(ts) {
  const d = new Date(ts)
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function NotificationsMenu({ onNavigate, user }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const menuRef = useRef(null)

  async function loadNotifications() {
    setLoading(true)
    try {
      const res = await notificationService.list(50)
      const localState = loadLocalState(user?.id)
      const readSet = new Set(localState.readIds)
      const normalized = (res.notifications || []).map((n) => ({
        ...n,
        read: n.read || readSet.has(n.id) || toTs(n.timestamp) <= localState.markAllTs,
      }))
      setItems(normalized)
      setUnreadCount(normalized.filter((n) => !n.read).length)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [user?.id])

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleOpenToggle() {
    const next = !open
    setOpen(next)
    if (next) await loadNotifications()
  }

  async function handleMarkRead(notificationId) {
    try {
      await notificationService.markRead(notificationId)
      const localState = loadLocalState(user?.id)
      const readSet = new Set(localState.readIds)
      readSet.add(notificationId)
      saveLocalState(user?.id, { ...localState, readIds: [...readSet] })
      setItems(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationService.markAllRead()
      saveLocalState(user?.id, { readIds: [], markAllTs: Date.now() })
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const unreadItems = useMemo(() => items.filter(i => !i.read), [items])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="p-2 rounded-xl bg-background/80 border border-border text-muted-foreground hover:text-foreground hover:border-ring/50 transition-all cursor-pointer relative"
        title="Notifications"
        onClick={handleOpenToggle}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
          <div className="px-3.5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-zinc-100">Notifications</div>
              <div className="text-[10px] text-zinc-500">{unreadItems.length} unread</div>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck size={12} /> Mark all as read
            </button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto no-scrollbar">
            {loading && <div className="px-4 py-6 text-xs text-zinc-500">Loading notifications...</div>}
            {!loading && items.length === 0 && <div className="px-4 py-6 text-xs text-zinc-500">No notifications yet.</div>}

            {!loading && items.map(n => {
              const Icon = iconFor(n.type)
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={async () => {
                    if (!n.read) await handleMarkRead(n.id)
                    onNavigate?.(n)
                    setOpen(false)
                  }}
                  className={`w-full px-3.5 py-3 text-left border-b border-zinc-800/70 hover:bg-zinc-900/70 transition-colors cursor-pointer ${n.read ? 'opacity-80' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${n.read ? 'border-zinc-700 text-zinc-400' : 'border-blue-500/40 text-blue-400 bg-blue-500/10'}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-xs font-semibold truncate ${n.read ? 'text-zinc-300' : 'text-zinc-100'}`}>{n.title}</div>
                        <div className="text-[10px] text-zinc-500 shrink-0">{timeAgo(n.timestamp)}</div>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{n.message}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationsMenu
