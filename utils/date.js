import { useState, useEffect } from 'react'

export function timeLeft(deadline) {
  if (!deadline) return null
  const target = new Date(deadline).getTime()
  if (isNaN(target)) return null
  const diff = target - Date.now()
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  return {
    ms: diff,
    h, m, s,
    breached: diff < 0,
    warning: diff > 0 && diff < 4 * 3600 * 1000,
    str: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
  }
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

export function timeAgo(timestamp) {
  if (!timestamp) return '—'
  const diffMs = Date.now() - new Date(timestamp).getTime()
  if (isNaN(diffMs)) return '—'
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
