import React from 'react'
import { GlassCard } from './GlassCard'

export function StatCard({ icon: Icon, label, value, sub, tone = 'zinc', onClick }) {
  const tones = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-400 hover:border-blue-500/40',
    emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40',
    amber: 'from-amber-500/10 to-amber-600/5 border-amber-500/20 text-amber-400 hover:border-amber-500/40',
    violet: 'from-violet-500/10 to-violet-600/5 border-violet-500/20 text-violet-400 hover:border-violet-500/40',
    red: 'from-red-500/10 to-red-600/5 border-red-500/20 text-red-400 hover:border-red-500/40',
    zinc: 'from-zinc-800/40 to-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700',
  }

  return (
    <GlassCard
      onClick={onClick}
      className={`p-4 bg-gradient-to-br transition-all ${tones[tone] || tones.zinc} ${onClick ? 'cursor-pointer hover:scale-[1.01]' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
        {Icon && <Icon size={18} className="shrink-0 opacity-80" />}
      </div>
      <div className="text-2xl font-extrabold text-zinc-100 mt-2 tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </GlassCard>
  )
}

export default StatCard
