'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

// Returns 0..1 phase across 24 hours and a "named" period for theming.
// Allows override via URL param ?period=dawn|morning|day|sunset|twilight|night
export function useTimeOfDay(updateMs = 60000) {
  const [now, setNow] = useState(() => new Date())
  const [override, setOverride] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), updateMs)
    // listen for override events
    const fromUrl = new URLSearchParams(window.location.search).get('period')
    const fromStorage = sessionStorage.getItem('altiflow_period_preview')
    setOverride(fromUrl || fromStorage || null)
    const handler = (e) => setOverride(e.detail || null)
    window.addEventListener('altiflow:period', handler)
    return () => { clearInterval(t); window.removeEventListener('altiflow:period', handler) }
  }, [updateMs])

  return useMemo(() => {
    if (override) {
      const h = { dawn: 6, morning: 9, day: 13, sunset: 17.5, twilight: 20, night: 23 }[override] ?? now.getHours()
      return { hour: h, period: override, date: now, override: true }
    }
    const h = now.getHours() + now.getMinutes() / 60
    let period = 'night'
    if (h >= 5 && h < 7) period = 'dawn'
    else if (h >= 7 && h < 11) period = 'morning'
    else if (h >= 11 && h < 16) period = 'day'
    else if (h >= 16 && h < 18.5) period = 'sunset'
    else if (h >= 18.5 && h < 21) period = 'twilight'
    else period = 'night'
    return { hour: h, period, date: now, override: false }
  }, [now, override])
}

export function setPeriodOverride(p) {
  if (typeof window === 'undefined') return
  if (p) sessionStorage.setItem('altiflow_period_preview', p)
  else sessionStorage.removeItem('altiflow_period_preview')
  window.dispatchEvent(new CustomEvent('altiflow:period', { detail: p }))
}

// gradient palette per period (top, mid, bottom)
const PALETTES = {
  dawn:     ['#1a0b2e', '#6b2f5c', '#f59e8a'], // deep violet → mauve → peach
  morning:  ['#0c1b3a', '#4a6fa5', '#a8c4e0'], // navy → sky → light blue
  day:      ['#0a1628', '#1e3a8a', '#3b82f6'], // deep blue → royal → sky
  sunset:   ['#2d0a36', '#c2410c', '#fbbf24'], // plum → orange → gold
  twilight: ['#0a0a23', '#3b2467', '#7c3aed'], // ink → indigo → violet
  night:    ['#000010', '#0b0b2a', '#1a1a4d'], // black → navy → cobalt
}

// Accent color tokens that other parts of the UI can pull
export const PERIOD_ACCENTS = {
  dawn:     { primary: '#f59e8a', glow: 'rgba(245,158,138,0.35)', name: 'Dawn' },
  morning:  { primary: '#7dd3fc', glow: 'rgba(125,211,252,0.30)', name: 'Morning' },
  day:      { primary: '#3b82f6', glow: 'rgba(59,130,246,0.30)',  name: 'Day' },
  sunset:   { primary: '#fb923c', glow: 'rgba(251,146,60,0.40)',  name: 'Sunset' },
  twilight: { primary: '#a78bfa', glow: 'rgba(167,139,250,0.35)', name: 'Twilight' },
  night:    { primary: '#818cf8', glow: 'rgba(129,140,248,0.25)', name: 'Night' },
}

// Position of sun/moon arc across the sky based on time
function celestialPosition(hour, isMoon) {
  // sun: rises ~6am, sets ~18:30. moon: opposite arc (18:30 .. 6:00 next day)
  let p
  if (!isMoon) {
    p = (hour - 6) / 12.5 // 0 at 6am → 1 at 18:30
  } else {
    let mh = hour
    if (mh < 6) mh += 24
    p = (mh - 18.5) / 11.5
  }
  p = Math.max(-0.1, Math.min(1.1, p))
  // x: 5% → 95%
  const x = 5 + p * 90
  // y: parabola, peak near middle. y from 85% (horizon) → 12% (peak) → 85%
  const y = 85 - Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) * 73
  return { x, y, p }
}

// star field
function useStars(n = 80) {
  return useMemo(() => Array.from({ length: n }).map((_, i) => ({
    id: i,
    cx: Math.random() * 100,
    cy: Math.random() * 70,
    r: Math.random() * 1.4 + 0.3,
    delay: Math.random() * 6,
    dur: 2 + Math.random() * 4,
    o: 0.3 + Math.random() * 0.7,
  })), [n])
}

function Stars({ visible }) {
  const stars = useStars(110)
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
      {stars.map(s => (
        <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r * 0.12}
          fill="white"
          style={{
            opacity: visible ? s.o : 0,
            transition: 'opacity 1.6s ease',
            animation: visible ? `tw ${s.dur}s ease-in-out ${s.delay}s infinite alternate` : 'none',
          }} />
      ))}
      <style>{`
        @keyframes tw { from { opacity: 0.15; } to { opacity: 1; } }
      `}</style>
    </svg>
  )
}

function ShootingStar({ visible }) {
  if (!visible) return null
  return (
    <motion.div
      className="absolute"
      initial={{ x: '-10%', y: '20%', opacity: 0 }}
      animate={{ x: '110%', y: '50%', opacity: [0, 1, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 8, ease: 'easeOut' }}
      style={{ left: 0, top: 0, width: '120px', height: '2px',
        background: 'linear-gradient(90deg, transparent, white, transparent)',
        filter: 'drop-shadow(0 0 6px white)',
        transform: 'rotate(15deg)',
      }}
    />
  )
}

function Sun({ x, y, period }) {
  const isSunset = period === 'sunset' || period === 'dawn'
  const color = isSunset ? '#fbbf24' : '#fde68a'
  const glow = isSunset ? '#f97316' : '#fcd34d'
  return (
    <motion.div
      className="absolute rounded-full"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
      animate={{ scale: [1, 1.04, 1] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="relative w-28 h-28 md:w-36 md:h-36">
        <div className="absolute inset-0 rounded-full" style={{
          background: `radial-gradient(circle at 35% 35%, ${color} 0%, ${glow} 55%, transparent 80%)`,
          boxShadow: `0 0 80px 20px ${glow}66, 0 0 200px 60px ${glow}33`,
        }} />
      </div>
    </motion.div>
  )
}

function Moon({ x, y }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #fafafa 0%, #d4d4d8 60%, #71717a 100%)',
          boxShadow: '0 0 60px 8px rgba(255,255,255,0.18), inset -8px -10px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* craters */}
        <div className="absolute w-3 h-3 rounded-full bg-zinc-500/30" style={{ left: '30%', top: '35%' }} />
        <div className="absolute w-2 h-2 rounded-full bg-zinc-500/30" style={{ left: '55%', top: '55%' }} />
        <div className="absolute w-1.5 h-1.5 rounded-full bg-zinc-500/30" style={{ left: '20%', top: '60%' }} />
      </div>
    </div>
  )
}

function Cloud({ top, left, size = 1, opacity = 0.18, duration = 80, delay = 0 }) {
  return (
    <motion.div
      className="absolute"
      style={{ top: `${top}%`, left: 0 }}
      initial={{ x: `${left}vw` }}
      animate={{ x: `${left + 130}vw` }}
      transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
    >
      <svg width={120 * size} height={50 * size} viewBox="0 0 120 50" style={{ opacity }}>
        <ellipse cx="30" cy="35" rx="25" ry="13" fill="white" />
        <ellipse cx="55" cy="28" rx="28" ry="16" fill="white" />
        <ellipse cx="85" cy="35" rx="22" ry="12" fill="white" />
      </svg>
    </motion.div>
  )
}

function MountainSilhouette({ period }) {
  // subtle mountain silhouette at bottom
  const color = period === 'night' ? '#050510' : period === 'twilight' ? '#0a0a1a' : period === 'sunset' ? '#1a0a14' : period === 'day' || period === 'morning' ? '#0a1424' : '#150818'
  return (
    <svg className="absolute bottom-0 left-0 w-full" height="220" viewBox="0 0 1440 220" preserveAspectRatio="none" style={{ transition: 'all 1.2s' }}>
      <path d={`M0 220 L0 140 L180 80 L320 130 L480 60 L640 120 L820 50 L1000 110 L1180 70 L1320 130 L1440 90 L1440 220 Z`} fill={color} opacity="0.85" />
      <path d={`M0 220 L0 170 L160 130 L300 160 L460 110 L620 150 L800 100 L980 145 L1180 115 L1320 160 L1440 130 L1440 220 Z`} fill={color} opacity="0.95" />
    </svg>
  )
}

// Drone hovering over the scene, occasionally firing a scan beam
function Drone({ period }) {
  // Choose a top position based on period (lower during night so silhouetted against moon)
  const yPct = 38
  const beamColor = period === 'night' || period === 'twilight' ? '#a78bfa'
    : period === 'sunset' || period === 'dawn' ? '#fbbf24'
    : '#60a5fa'
  const propColor = period === 'night' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.7)'

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ top: `${yPct}%`, left: 0, width: '100%' }}
      // horizontal patrol across the sky
      initial={{ x: '-12vw' }}
      animate={{ x: ['-12vw', '60vw', '20vw', '85vw', '40vw', '-12vw'] }}
      transition={{ duration: 60, repeat: Infinity, ease: 'easeInOut', times: [0, 0.22, 0.45, 0.65, 0.85, 1] }}
    >
      <motion.div
        // vertical hover bob
        animate={{ y: [0, -8, 0, -4, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
        style={{ width: 120, height: 80 }}
      >
        {/* Scan beam — cone of light shining down */}
        <motion.div
          className="absolute left-1/2 top-[34px] origin-top"
          style={{
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '60px solid transparent',
            borderRight: '60px solid transparent',
            borderTop: `260px solid ${beamColor}`,
            filter: 'blur(2px)',
            opacity: 0.16,
          }}
          animate={{ opacity: [0.05, 0.22, 0.05] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Soft glow under the drone */}
        <div className="absolute left-1/2 top-[20px] -translate-x-1/2 w-24 h-24 rounded-full"
          style={{
            background: `radial-gradient(circle, ${beamColor}33 0%, transparent 65%)`,
            filter: 'blur(8px)',
          }}
        />

        {/* Drone body SVG */}
        <svg viewBox="0 0 120 60" width="120" height="60" className="relative" style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))' }}>
          {/* arms */}
          <line x1="22" y1="22" x2="40" y2="32" stroke="#27272a" strokeWidth="4" strokeLinecap="round" />
          <line x1="98" y1="22" x2="80" y2="32" stroke="#27272a" strokeWidth="4" strokeLinecap="round" />
          <line x1="22" y1="42" x2="40" y2="32" stroke="#27272a" strokeWidth="4" strokeLinecap="round" />
          <line x1="98" y1="42" x2="80" y2="32" stroke="#27272a" strokeWidth="4" strokeLinecap="round" />
          {/* body */}
          <rect x="46" y="24" width="28" height="16" rx="4" fill="#18181b" stroke="#3f3f46" strokeWidth="0.6" />
          <rect x="50" y="27" width="20" height="3" fill={beamColor} opacity="0.7" />
          {/* tiny LED */}
          <circle cx="60" cy="36" r="1.2" fill="#10b981" />
          {/* camera lens */}
          <circle cx="60" cy="42" r="3" fill="#0a0a0a" stroke={beamColor} strokeWidth="0.8" />
          <circle cx="60" cy="42" r="1.2" fill={beamColor} opacity="0.8" />
        </svg>

        {/* Spinning propellers */}
        {[
          { x: 22, y: 22 }, { x: 98, y: 22 }, { x: 22, y: 42 }, { x: 98, y: 42 },
        ].map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: p.x - 11, top: p.y - 11,
              width: 22, height: 22,
              background: `radial-gradient(circle, ${propColor} 0%, transparent 65%)`,
              opacity: 0.55,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.06, repeat: Infinity, ease: 'linear' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ width: 18, height: 1.5, background: propColor, borderRadius: 1 }} />
              <div className="absolute" style={{ width: 1.5, height: 18, background: propColor, borderRadius: 1 }} />
            </div>
          </motion.div>
        ))}

        {/* Scanning pulse (data capture) */}
        <motion.div
          className="absolute left-1/2 top-[42px] -translate-x-1/2 rounded-full border"
          style={{ borderColor: beamColor, width: 30, height: 30 }}
          animate={{ scale: [1, 5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
        />

        {/* Telemetry mini-pill */}
        <motion.div
          className="absolute -right-2 -top-2 px-1.5 py-0.5 rounded font-mono text-[7px] tracking-widest"
          style={{ background: 'rgba(0,0,0,0.65)', color: beamColor, border: `1px solid ${beamColor}55` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          REC
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

// Data packets streaming down from drone scan
function DataStream({ period }) {
  const color = period === 'night' || period === 'twilight' ? '#a78bfa' : period === 'sunset' || period === 'dawn' ? '#fbbf24' : '#60a5fa'
  const items = useMemo(() => Array.from({ length: 14 }).map((_, i) => ({
    id: i,
    left: 5 + Math.random() * 90,
    delay: Math.random() * 4,
    dur: 3 + Math.random() * 3,
    char: ['1','0','{}','[]','01','π','◆'][Math.floor(Math.random() * 7)],
  })), [])
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {items.map(it => (
        <motion.span
          key={it.id}
          className="absolute font-mono text-[10px]"
          style={{ left: `${it.left}%`, top: '40%', color, textShadow: `0 0 6px ${color}88` }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.7, 0], y: [0, 220] }}
          transition={{ duration: it.dur, delay: it.delay, repeat: Infinity, ease: 'easeIn' }}
        >
          {it.char}
        </motion.span>
      ))}
    </div>
  )
}

export default function TimeBackdrop() {
  const { hour, period } = useTimeOfDay(60000)
  const palette = PALETTES[period]
  const sun = celestialPosition(hour, false)
  const moon = celestialPosition(hour, true)

  const showStars = period === 'night' || period === 'twilight' || period === 'dawn'
  const showSun = sun.p > -0.05 && sun.p < 1.05 && period !== 'night'
  const showMoon = (moon.p > -0.05 && moon.p < 1.05) && (period === 'night' || period === 'twilight' || period === 'dawn')

  // gradient with subtle motion
  const gradient = `linear-gradient(180deg, ${palette[0]} 0%, ${palette[1]} 55%, ${palette[2]} 100%)`

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* base gradient sky */}
      <motion.div
        key={period}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6 }}
        className="absolute inset-0"
        style={{ background: gradient }}
      />

      {/* faint grid pattern */}
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* aurora glow blobs */}
      <div className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full blur-3xl opacity-30"
        style={{ background: `radial-gradient(circle, ${PERIOD_ACCENTS[period].primary} 0%, transparent 70%)` }} />
      <div className="absolute top-1/3 -left-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
        style={{ background: `radial-gradient(circle, ${palette[2]} 0%, transparent 70%)` }} />

      {/* stars */}
      <Stars visible={showStars} />
      <ShootingStar visible={period === 'night'} />

      {/* sun / moon */}
      {showSun && <Sun x={sun.x} y={sun.y} period={period} />}
      {showMoon && <Moon x={moon.x} y={moon.y} />}

      {/* drifting clouds for day-ish periods */}
      {(period === 'morning' || period === 'day' || period === 'sunset') && (
        <>
          <Cloud top={10} left={-30} size={1.1} opacity={period === 'sunset' ? 0.18 : 0.22} duration={130} />
          <Cloud top={22} left={-60} size={0.9} opacity={period === 'sunset' ? 0.14 : 0.16} duration={170} delay={20} />
          <Cloud top={35} left={-20} size={1.3} opacity={period === 'sunset' ? 0.20 : 0.18} duration={200} delay={50} />
        </>
      )}

      {/* mountain silhouettes at horizon */}
      <MountainSilhouette period={period} />

      {/* Drone hovering across the sky */}
      <Drone period={period} />
      <DataStream period={period} />

      {/* readability vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.45) 100%)'
      }} />
    </div>
  )
}
