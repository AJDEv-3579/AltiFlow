import React from 'react'
import { Clock, AlertTriangle, AlertCircle } from 'lucide-react'
import { timeLeft, useNow } from '@/utils/date'

export function SLAClock({ deadline, compact = false }) {
  useNow(1000)
  const info = timeLeft(deadline)

  if (!info) {
    return <span className="text-zinc-600 text-xs font-mono">—</span>
  }

  if (info.breached) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-md">
        <AlertCircle size={12} /> Breach +{info.str}
      </span>
    )
  }

  if (info.warning) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
        <AlertTriangle size={12} /> {info.str}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
      <Clock size={12} /> {info.str}
    </span>
  )
}

export default SLAClock
