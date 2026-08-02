import React from 'react'
import { Sunrise, Sun as SunIcon, Sunset, Moon as MoonIcon } from 'lucide-react'
import { PERIOD_ACCENTS, useTimeOfDay } from '@/components/TimeBackdrop'

export function PeriodChip() {
  const { period, date, override } = useTimeOfDay(60000)
  const meta = PERIOD_ACCENTS[period] || PERIOD_ACCENTS.morning
  const Icon = period === 'night' || period === 'twilight' ? MoonIcon : period === 'sunset' ? Sunset : period === 'dawn' ? Sunrise : SunIcon
  const time = date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 backdrop-blur-md">
      <Icon size={13} style={{ color: meta.primary }} />
      <span className="text-xs text-zinc-200">{meta.name}{override && ' (preview)'}</span>
      <span className="text-[10px] text-zinc-400 font-mono">{time}</span>
    </div>
  )
}

export default PeriodChip
