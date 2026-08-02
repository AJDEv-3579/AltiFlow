import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PERIOD_ACCENTS, useTimeOfDay, setPeriodOverride } from '@/components/TimeBackdrop'
import { Sunrise, Sun as SunIcon, Sunset, Moon as MoonIcon, RefreshCw, Sparkles } from 'lucide-react'

export function PeriodSwitcher() {
  const { period, override } = useTimeOfDay(60000)
  const [open, setOpen] = useState(false)
  const periods = [
    { k: 'dawn', l: 'Dawn', i: Sunrise },
    { k: 'morning', l: 'Morning', i: SunIcon },
    { k: 'day', l: 'Day', i: SunIcon },
    { k: 'sunset', l: 'Sunset', i: Sunset },
    { k: 'twilight', l: 'Twilight', i: MoonIcon },
    { k: 'night', l: 'Night', i: MoonIcon },
  ]
  const currentAccent = PERIOD_ACCENTS[period] || PERIOD_ACCENTS.morning

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="mb-2 p-2 rounded-2xl bg-zinc-950/90 border border-white/10 flex flex-col gap-1 min-w-[180px] backdrop-blur-xl shadow-2xl">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2 py-1 font-semibold">Preview scene</div>
            {periods.map(p => {
              const meta = PERIOD_ACCENTS[p.k] || {}
              const active = period === p.k
              const Icon = p.i
              return (
                <button key={p.k} onClick={() => { setPeriodOverride(p.k); setOpen(false) }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition cursor-pointer ${active ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300 hover:bg-white/5'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: meta.primary || '#fff' }} />
                  <Icon size={13} />{p.l}
                </button>
              )
            })}
            {override && (
              <button onClick={() => { setPeriodOverride(null); setOpen(false) }}
                className="flex items-center gap-2 px-2 py-1.5 mt-1 rounded-lg text-xs text-zinc-400 hover:bg-white/5 border-t border-white/10 cursor-pointer">
                <RefreshCw size={12} />Use real time
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(o => !o)}
        className="w-11 h-11 rounded-full bg-zinc-950/80 border border-white/10 flex items-center justify-center hover:scale-105 transition shadow-2xl cursor-pointer backdrop-blur-md"
        style={{ boxShadow: `0 0 25px ${currentAccent.glow || 'rgba(255,255,255,0.1)'}` }}
        title="Preview backdrop scene">
        <Sparkles size={18} style={{ color: currentAccent.primary || '#fff' }} />
      </button>
    </div>
  )
}

export default PeriodSwitcher
