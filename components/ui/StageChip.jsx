import React from 'react'

export function StageChip({ status }) {
  const st = status || 'Pending'
  const styles = {
    Done: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    'In Progress': 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    Pending: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    Cancelled: 'bg-red-500/10 border-red-500/30 text-red-400',
    Blocked: 'bg-red-500/10 border-red-500/30 text-red-400',
  }
  return (
    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${styles[st] || styles.Pending}`}>
      {st}
    </span>
  )
}

export default StageChip
