'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import TimeBackdrop, { useTimeOfDay, PERIOD_ACCENTS, setPeriodOverride } from '@/components/TimeBackdrop'
import {
  Activity, AlertTriangle, ArrowRight, Building2, ChevronDown, ChevronRight,
  ClipboardList, Clock, Command, FileWarning, Layers, LogOut, MapPin, Menu, Package,
  Plane, Plus, Radar, RefreshCw, Rocket, Search, Settings, Shield, ShieldAlert,
  Sparkles, Trash2, Upload, User, Users, X, Camera, FileCheck, Zap, ChevronLeft,
  CheckCircle2, Lock, Hash, Calendar, Box, Server, BarChart3, Bell, Sunrise, Sunset, Moon as MoonIcon, Sun as SunIcon,
} from 'lucide-react'

// ============== API HELPER ==============
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('altiflow_token') : null }
function setToken(t) { localStorage.setItem('altiflow_token', t) }
function clearToken() { localStorage.removeItem('altiflow_token') }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`/api${path}`, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ============== UTIL ==============
const STATUSES = ['Pending', 'In-Download', 'QC', 'Processing', 'Delivery']
const STATUS_COLORS = {
  'Pending': { bg: 'from-blue-500/10 to-blue-500/5', text: 'text-blue-300', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  'In-Download': { bg: 'from-cyan-500/10 to-cyan-500/5', text: 'text-cyan-300', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  'QC': { bg: 'from-violet-500/10 to-violet-500/5', text: 'text-violet-300', border: 'border-violet-500/30', dot: 'bg-violet-500' },
  'Processing': { bg: 'from-amber-500/10 to-amber-500/5', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  'Delivery': { bg: 'from-emerald-500/10 to-emerald-500/5', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  'Failed_Refly': { bg: 'from-red-600/15 to-red-600/5', text: 'text-red-300', border: 'border-red-500/50', dot: 'bg-red-500' },
}

function timeLeft(deadline) {
  const ms = new Date(deadline).getTime() - Date.now()
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  return { ms, h, m, s, breached: ms < 0, warning: ms > 0 && ms < 4 * 3600 * 1000, str: `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` }
}

function useNow(interval = 1000) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set(x => x + 1), interval); return () => clearInterval(t) }, [interval])
}

// ============== PRIMITIVES ==============
function GlassCard({ children, className = '' }) {
  return <div className={`glass rounded-2xl ${className}`}>{children}</div>
}

function Btn({ children, onClick, variant = 'primary', size = 'md', className = '', disabled, type = 'button', icon: Icon }) {
  const sizes = { sm: 'h-9 px-3 text-xs', md: 'h-11 px-4 text-sm', lg: 'h-14 px-6 text-base fat-input' }
  const variants = {
    primary: 'bg-white text-zinc-900 hover:bg-zinc-200 active:bg-zinc-300',
    ghost: 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/50',
    outline: 'bg-transparent hover:bg-zinc-800/40 text-zinc-100 border border-zinc-700',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`${sizes[size]} ${variants[variant]} ${className} inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed`}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}{children}
    </button>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      {children}
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </label>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text', big = false, ...rest }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 ${big ? 'h-14 text-base fat-input' : 'h-11 text-sm'} text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition`}
      {...rest} />
  )
}

function NumberInput({ value, onChange, big = false }) {
  const v = value === '' || value === null || value === undefined ? '' : value
  return (
    <div className={`flex items-stretch bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden ${big ? 'h-14' : 'h-11'}`}>
      <button type="button" onClick={() => onChange(Math.max(0, parseInt(v || 0) - 1))} className="px-4 hover:bg-zinc-800 text-zinc-400">−</button>
      <input type="number" min="0" value={v} onChange={e => onChange(e.target.value === '' ? '' : parseInt(e.target.value))}
        className={`flex-1 bg-transparent text-center font-mono ${big ? 'text-xl' : 'text-base'} text-zinc-100 focus:outline-none`} />
      <button type="button" onClick={() => onChange((parseInt(v || 0)) + 1)} className="px-4 hover:bg-zinc-800 text-zinc-400">+</button>
    </div>
  )
}

function Toggle({ value, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between gap-3 px-4 py-4 rounded-lg border transition fat-input ${value ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'}`}>
      <div className="text-left">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        {hint && <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>}
      </div>
      <div className={`relative w-12 h-7 rounded-full transition ${value ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
        <div className={`absolute top-0.5 ${value ? 'left-[22px]' : 'left-0.5'} w-6 h-6 rounded-full bg-white shadow transition-all`}></div>
      </div>
    </button>
  )
}

// ============== AURORA BG ==============
function Backdrop() {
  return <TimeBackdrop />
}

// ============== TIME PERIOD CHIP ==============
function PeriodChip() {
  const { period, date, override } = useTimeOfDay(60000)
  const meta = PERIOD_ACCENTS[period]
  const Icon = period === 'night' ? MoonIcon : period === 'sunset' ? Sunset : period === 'dawn' ? Sunrise : SunIcon
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 backdrop-blur-md">
      <Icon size={13} style={{ color: meta.primary }} />
      <span className="text-xs text-zinc-200">{meta.name}{override && ' (preview)'}</span>
      <span className="text-[10px] text-zinc-400 font-mono">{time}</span>
    </div>
  )
}

// ============== PERIOD PREVIEW SWITCHER ==============
function PeriodSwitcher() {
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
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="mb-2 p-2 rounded-2xl glass-strong border border-white/10 flex flex-col gap-1 min-w-[180px]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 px-2 py-1">Preview scene</div>
            {periods.map(p => {
              const meta = PERIOD_ACCENTS[p.k]
              const active = period === p.k
              return (
                <button key={p.k} onClick={() => { setPeriodOverride(p.k); setOpen(false) }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition ${active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: meta.primary }} />
                  <p.i size={13} />{p.l}
                </button>
              )
            })}
            {override && (
              <button onClick={() => { setPeriodOverride(null); setOpen(false) }}
                className="flex items-center gap-2 px-2 py-1.5 mt-1 rounded-lg text-xs text-zinc-400 hover:bg-white/5 border-t border-white/10">
                <RefreshCw size={12} />Use real time
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full glass-strong border border-white/10 flex items-center justify-center hover:scale-105 transition shadow-2xl"
        style={{ boxShadow: `0 0 30px ${PERIOD_ACCENTS[period].glow}` }}
        title="Preview backdrop scene">
        <Sparkles size={18} style={{ color: PERIOD_ACCENTS[period].primary }} />
      </button>
    </div>
  )
}

// ============== LOGIN ==============
function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
      setToken(r.token)
      toast.success(`Welcome back, ${r.user.username}`)
      onLogin(r.user)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  function quick(u, p) { setUsername(u); setPassword(p) }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <Backdrop />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-emerald-500 flex items-center justify-center">
              <Plane className="text-white" size={20} />
            </div>
            <div className="text-3xl font-bold tracking-tight">Altiflow</div>
          </motion.div>
          <div className="text-sm text-zinc-500">Industrial Photogrammetry Operations</div>
        </div>

        <GlassCard className="p-8">
          <form onSubmit={submit} className="space-y-4">
            <Field label="User ID">
              <TextInput value={username} onChange={setUsername} placeholder="devbond01 / rohit / bayer" />
            </Field>
            <Field label="Password">
              <TextInput value={password} onChange={setPassword} type="password" placeholder="••••••••" />
            </Field>
            <Btn type="submit" disabled={busy || !username || !password} className="w-full mt-2">
              {busy ? 'Authenticating…' : 'Sign in'}
              <ArrowRight size={16} />
            </Btn>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">Quick access (demo)</div>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => quick('devbond01', '63pk0wpT@123')} className="text-left text-xs flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800">
                <span className="flex items-center gap-2"><Shield size={14} className="text-blue-400" /> Super Admin <span className="text-zinc-500">devbond01</span></span>
                <ChevronRight size={14} className="text-zinc-600" />
              </button>
              <button type="button" onClick={() => quick('Rohit', 'WelcometoAlti@123')} className="text-left text-xs flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800">
                <span className="flex items-center gap-2"><Users size={14} className="text-violet-400" /> Team <span className="text-zinc-500">Rohit</span></span>
                <ChevronRight size={14} className="text-zinc-600" />
              </button>
              <button type="button" onClick={() => quick('bayer', 'WelcometoAlti@123')} className="text-left text-xs flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800">
                <span className="flex items-center gap-2"><Building2 size={14} className="text-emerald-400" /> Client <span className="text-zinc-500">bayer (Bayer)</span></span>
                <ChevronRight size={14} className="text-zinc-600" />
              </button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}

// ============== FORCE PASSWORD CHANGE ==============
function ChangePassword({ user, onDone }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) })
      toast.success('Password updated.')
      onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <Backdrop />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
        <GlassCard className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Lock className="text-amber-400" size={18} />
            </div>
            <div>
              <div className="text-lg font-semibold">Set a new password</div>
              <div className="text-xs text-zinc-500">First-time login — required for {user.username}</div>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Current password (default)">
              <TextInput value={current} onChange={setCurrent} type="password" placeholder="WelcometoAlti@123" />
            </Field>
            <Field label="New password" hint="At least 6 characters.">
              <TextInput value={next} onChange={setNext} type="password" placeholder="••••••••" />
            </Field>
            <Btn type="submit" disabled={busy} className="w-full">{busy ? 'Updating…' : 'Update password'}</Btn>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}

// ============== SLA CLOCK ==============
function SLAClock({ deadline, compact = false }) {
  useNow(1000)
  const t = timeLeft(deadline)
  let cls = 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
  let label = 'On track'
  if (t.breached) { cls = 'text-red-300 bg-red-500/15 border-red-500/40 pulse-red'; label = 'Breached' }
  else if (t.warning) { cls = 'text-red-300 bg-red-500/10 border-red-500/40 pulse-red'; label = 'Warning' }
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 ${cls}`}>
      <Clock size={12} />
      <span className="font-mono text-xs">{t.breached ? '−' : ''}{t.str}</span>
      {!compact && <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>}
    </div>
  )
}

// ============== PROJECT CARD ==============
function ProjectCard({ p, onClick, draggable = false, role }) {
  const isRefly = p.status === 'Failed_Refly'
  const locked = isRefly && !p.refly_resolved
  const c = STATUS_COLORS[p.status] || STATUS_COLORS['Pending']
  useNow(1000)
  const t = timeLeft(p.sla_deadline)
  const borderCls = locked ? 'border-red-500/50 pulse-crimson' : (t.warning || t.breached) ? 'border-red-500/40' : 'border-zinc-800/80'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: p.id, disabled: !draggable || locked
  })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined

  return (
    <motion.div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => !isDragging && onClick?.(p)}
      className={`group relative cursor-pointer rounded-xl glass border ${borderCls} p-4 hover:border-zinc-600 transition-all`}
    >
      {locked && (
        <div className="absolute top-2 right-2 flex items-center gap-1 text-red-300 text-[10px] uppercase tracking-wider">
          <Lock size={10} /> Locked
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate text-zinc-100">{p.title}</div>
          {role !== 'Client' && (
            <div className="text-[11px] text-zinc-500 truncate">{p.client_name}</div>
          )}
        </div>
        <div className={`${c.dot} w-2 h-2 rounded-full mt-1.5 shrink-0`} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-3">
        <Plane size={11} />{p.drone_name}
        <span className="text-zinc-700">•</span>
        <Calendar size={11} />{p.capture_date}
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="rounded-md bg-zinc-900/60 border border-zinc-800/60 px-2 py-1">
          <div className="text-[9px] uppercase text-zinc-600">IMG</div>
          <div className="font-mono text-xs text-zinc-200">{p.image_count}</div>
        </div>
        <div className="rounded-md bg-zinc-900/60 border border-zinc-800/60 px-2 py-1">
          <div className="text-[9px] uppercase text-zinc-600">CSV</div>
          <div className="font-mono text-xs text-zinc-200">{p.csv_count}</div>
        </div>
        <div className="rounded-md bg-zinc-900/60 border border-zinc-800/60 px-2 py-1">
          <div className="text-[9px] uppercase text-zinc-600">Δ</div>
          <div className={`font-mono text-xs ${(p.image_count - p.csv_count) > 10 ? 'text-red-300' : 'text-zinc-200'}`}>{p.image_count - p.csv_count}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <SLAClock deadline={p.sla_deadline} compact />
        {role !== 'Client' && p.assignee_name && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-500"><User size={10} />{p.assignee_name}</div>
        )}
      </div>

      {locked && (
        <div className="mt-2 text-[10px] text-red-300/80 flex items-center gap-1">
          <ShieldAlert size={10} /> Refly required → unlock with note + photo
        </div>
      )}
    </motion.div>
  )
}

// ============== KANBAN ==============
function KanbanColumn({ status, children, count }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const c = STATUS_COLORS[status]
  return (
    <div ref={setNodeRef}
      className={`flex-1 min-w-[280px] rounded-2xl border ${isOver ? 'border-zinc-500 bg-zinc-900/60' : 'border-zinc-800/60 bg-zinc-900/30'} backdrop-blur transition-colors`}>
      <div className={`px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${c.dot}`} />
          <div className="text-sm font-semibold text-zinc-200">{status}</div>
        </div>
        <div className="text-xs font-mono text-zinc-500">{count}</div>
      </div>
      <div className="p-3 space-y-3 min-h-[200px]">
        {children}
      </div>
    </div>
  )
}

function Kanban({ projects, onMove, onCardClick, role }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [active, setActive] = useState(null)

  function handleEnd(e) {
    setActive(null)
    if (!e.over) return
    const card = projects.find(p => p.id === e.active.id)
    const target = e.over.id
    if (!card || card.status === target) return
    if (card.status === 'Failed_Refly' && !card.refly_resolved) {
      toast.error('Card is locked. Resolve Refly first.'); return
    }
    onMove(card, target)
  }

  // Failed_Refly cards go in their original "Pending" lane visually but with locked overlay
  const grouped = useMemo(() => {
    const g = Object.fromEntries(STATUSES.map(s => [s, []]))
    for (const p of projects) {
      if (p.status === 'Failed_Refly') g['Pending'].push(p)
      else if (g[p.status]) g[p.status].push(p)
    }
    return g
  }, [projects])

  return (
    <DndContext sensors={sensors} onDragStart={e => setActive(projects.find(p => p.id === e.active.id))} onDragEnd={handleEnd} onDragCancel={() => setActive(null)}>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4">
        {STATUSES.map(s => (
          <KanbanColumn key={s} status={s} count={grouped[s].length}>
            <AnimatePresence>
              {grouped[s].map(p => (
                <ProjectCard key={p.id} p={p} onClick={onCardClick} draggable role={role} />
              ))}
            </AnimatePresence>
            {grouped[s].length === 0 && (
              <div className="text-center text-xs text-zinc-600 py-8 border border-dashed border-zinc-800/60 rounded-lg">Drop here</div>
            )}
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay>
        {active && <div className="opacity-90"><ProjectCard p={active} role={role} /></div>}
      </DragOverlay>
    </DndContext>
  )
}

// ============== PROJECT DETAIL DRAWER ==============
function ProjectDrawer({ project, onClose, role, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [logs, setLogs] = useState([])

  useEffect(() => {
    if (!project) return
    if (role === 'Client') return
    api(`/projects/${project.id}`).then(r => setLogs(r.audit_logs || [])).catch(() => {})
  }, [project, role])

  if (!project) return null

  async function handlePhoto(e) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => setPhoto(r.result); r.readAsDataURL(f)
  }

  async function resolveRefly() {
    if (!note || !photo) { toast.error('Add a note and corrective photo.'); return }
    setBusy(true)
    try {
      await api(`/projects/${project.id}/issue-note`, { method: 'POST', body: JSON.stringify({ note, photo_data_url: photo }) })
      toast.success('Refly resolved. Card unlocked → Pending.')
      onChanged()
      onClose()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  async function confirmDelivery() {
    setBusy(true)
    try {
      await api(`/projects/${project.id}/confirm-delivery`, { method: 'POST' })
      toast.success('Delivery confirmed.')
      onChanged(); onClose()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const locked = project.status === 'Failed_Refly' && !project.refly_resolved

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="ml-auto w-full max-w-lg h-full glass-strong border-l border-zinc-800/80 overflow-y-auto relative">
        <div className="sticky top-0 z-10 glass-strong border-b border-zinc-800/60 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500">{project.client_name}</div>
            <div className="font-semibold">{project.title}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded-md text-xs ${STATUS_COLORS[project.status].text} ${STATUS_COLORS[project.status].border} border bg-zinc-900/40`}>{project.status.replace('_', ' ')}</span>
            <SLAClock deadline={project.sla_deadline} />
            <span className="text-xs text-zinc-500">SLA window: <span className="font-mono text-zinc-300">{project.sla_hours}h</span></span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Drone</div>
              <div className="font-medium">{project.drone_name}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Capture Date</div>
              <div className="font-medium">{project.capture_date}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Image Count</div>
              <div className="font-mono">{project.image_count}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">CSV Count</div>
              <div className="font-mono">{project.csv_count}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Base/Rover</div>
              <div className={project.base_rover_bool ? 'text-emerald-300' : 'text-red-300'}>{project.base_rover_bool ? 'Present' : 'Missing'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Grid File</div>
              <div className={project.grid_file_bool ? 'text-emerald-300' : 'text-zinc-500'}>{project.grid_file_bool ? 'Yes' : 'No'}</div>
            </GlassCard>
          </div>

          {role !== 'Client' && project.refly_reason && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-center gap-2 text-red-300 mb-1"><ShieldAlert size={14} /> Refly Trigger</div>
              <div className="text-sm text-zinc-300">{project.refly_reason}</div>
              {project.assignee_name && <div className="text-xs text-zinc-500 mt-1">Auto-assigned to {project.assignee_name} (round-robin)</div>}
            </div>
          )}

          {locked && role === 'Team' && (
            <GlassCard className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-300"><FileWarning size={14} /> Resolve Refly</div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                placeholder="Describe corrective action (e.g., reflight planned, base station error fixed)…"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600" />
              <div>
                <input type="file" accept="image/*" id="reflyphoto" onChange={handlePhoto} className="hidden" />
                <label htmlFor="reflyphoto" className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">
                  <Camera size={14} /> Upload corrective photo
                </label>
                {photo && <img src={photo} alt="" className="mt-3 rounded-lg max-h-40 border border-zinc-800" />}
              </div>
              <Btn variant="success" disabled={busy} onClick={resolveRefly} icon={CheckCircle2}>Unlock & resolve</Btn>
            </GlassCard>
          )}

          {project.refly_resolved && project.issue_note && role !== 'Client' && (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 text-emerald-300 mb-2"><CheckCircle2 size={14} /> Refly resolved</div>
              <div className="text-sm text-zinc-300">{project.issue_note}</div>
              {project.issue_photo && <img src={project.issue_photo} alt="" className="mt-3 rounded-lg max-h-40 border border-zinc-800" />}
            </GlassCard>
          )}

          {role === 'Client' && project.status === 'Delivery' && !project.delivery_confirmed && (
            <Btn variant="success" size="lg" onClick={confirmDelivery} disabled={busy} icon={CheckCircle2}>Confirm Delivery</Btn>
          )}
          {role === 'Client' && project.delivery_confirmed && (
            <div className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 size={14} /> Delivery confirmed</div>
          )}

          {role !== 'Client' && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Audit Trail</div>
              <div className="space-y-2">
                {logs.length === 0 && <div className="text-xs text-zinc-600">No events yet.</div>}
                {logs.map(l => (
                  <div key={l.id} className="text-xs text-zinc-400 flex gap-2 items-start">
                    <div className="w-1 h-1 rounded-full bg-zinc-600 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div>{l.action_desc}</div>
                      <div className="text-[10px] text-zinc-600">{new Date(l.timestamp).toLocaleString()} · {l.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ============== CLIENT UPLOAD FORM ==============
function UploadForm({ onDone, clients, clientId }) {
  const [form, setForm] = useState({
    title: '', drone_name: '', capture_date: new Date().toISOString().slice(0, 10),
    image_count: 0, csv_count: 0, base_rover_bool: false, grid_file_bool: false,
    client_id: clientId || '',
  })
  const [busy, setBusy] = useState(false)
  function haptic() { try { navigator.vibrate?.(10) } catch (e) {} }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); haptic() }

  const mismatch = (parseInt(form.image_count || 0) - parseInt(form.csv_count || 0))
  const willRefly = mismatch > 10 && !form.base_rover_bool

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = { ...form }
      if (!clientId) payload.client_id = form.client_id
      const r = await api('/projects', { method: 'POST', body: JSON.stringify(payload) })
      const p = r.project
      if (p.status === 'Failed_Refly') {
        toast.error('Auto-flagged Failed_Refly — assigned to internal team for refly.', { duration: 6000 })
      } else {
        toast.success(`Project submitted. SLA: ${p.sla_hours}h.`)
      }
      onDone(p)
      setForm({ title: '', drone_name: '', capture_date: new Date().toISOString().slice(0, 10), image_count: 0, csv_count: 0, base_rover_bool: false, grid_file_bool: false, client_id: clientId || '' })
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-2xl">
      {!clientId && (
        <Field label="Client">
          <select value={form.client_id} onChange={e => set('client_id', e.target.value)}
            className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm">
            <option value="">Select…</option>
            {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Project Title">
        <TextInput big value={form.title} onChange={v => set('title', v)} placeholder="e.g., North Block Aerial Mapping" />
      </Field>
      <Field label="Drone Name">
        <TextInput big value={form.drone_name} onChange={v => set('drone_name', v)} placeholder="DJI Matrice 350 RTK" />
      </Field>
      <Field label="Capture Date">
        <TextInput big value={form.capture_date} onChange={v => set('capture_date', v)} type="date" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Image Count">
          <NumberInput big value={form.image_count} onChange={v => set('image_count', v)} />
        </Field>
        <Field label="CSV Count">
          <NumberInput big value={form.csv_count} onChange={v => set('csv_count', v)} />
        </Field>
      </div>
      <Toggle value={form.base_rover_bool} onChange={v => set('base_rover_bool', v)} label="Base / Rover present" hint="RTK correction data uploaded." />
      <Toggle value={form.grid_file_bool} onChange={v => set('grid_file_bool', v)} label="Grid File included" hint="GCP grid for georeferencing." />

      <AnimatePresence>
        {willRefly && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm">
            <ShieldAlert size={16} className="mt-0.5" />
            <div>
              <div className="font-medium">Refly will be auto-triggered.</div>
              <div className="text-xs text-red-300/70 mt-0.5">Image-CSV mismatch ({mismatch}) &gt; 10 and no Base/Rover correction. Card will be locked and assigned via round-robin.</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Btn size="lg" type="submit" disabled={busy} icon={Upload}>
        {busy ? 'Submitting…' : 'Submit upload'}
      </Btn>
      <div className="text-[11px] text-zinc-600">The server stamps the upload time automatically — you cannot set it manually.</div>
    </form>
  )
}

// ============== SHELL ==============
function Topbar({ user, onLogout, title, subtitle }) {
  return (
    <div className="sticky top-0 z-30 glass-strong border-b border-zinc-800/60">
      <div className="px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-emerald-500 flex items-center justify-center shrink-0">
            <Plane className="text-white" size={16} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{title || 'Altiflow'}</div>
            {subtitle && <div className="text-[11px] text-zinc-500 truncate">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PeriodChip />
          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10">
            <User size={12} />{user.username}
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">{user.role}</span>
          </div>
          <button onClick={onLogout} className="p-2 hover:bg-white/10 rounded-lg text-zinc-300"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  )
}

// ============== ADMIN APP ==============
function AdminApp({ user, onLogout }) {
  const [tab, setTab] = useState('dashboard')
  const [projects, setProjects] = useState([])
  const [clients, setClients] = useState([])
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [active, setActive] = useState(null)

  async function refresh() {
    try {
      const [p, c, u, a] = await Promise.all([
        api('/projects'), api('/clients'), api('/users'), api('/analytics'),
      ])
      setProjects(p.projects); setClients(c.clients); setUsers(u.users); setAnalytics(a)
      if (tab === 'audit') {
        const al = await api('/audit-logs'); setLogs(al.logs)
      }
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { if (tab === 'audit') api('/audit-logs').then(r => setLogs(r.logs)).catch(() => {}) }, [tab])

  async function moveCard(card, target) {
    try {
      await api(`/projects/${card.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: target }) })
      toast.success(`Moved → ${target}`)
      refresh()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="min-h-screen relative">
      <Backdrop />
      <Topbar user={user} onLogout={onLogout} title="Command Center" subtitle="Super Admin · Global View" />
      <div className="px-4 md:px-8 py-6 relative z-10">
        <div className="flex items-center gap-1 mb-6 overflow-x-auto no-scrollbar">
          {[
            { k: 'dashboard', l: 'Dashboard', i: BarChart3 },
            { k: 'pipeline', l: 'Pipeline', i: Layers },
            { k: 'clients', l: 'Clients', i: Building2 },
            { k: 'users', l: 'Users', i: Users },
            { k: 'audit', l: 'Audit Logs', i: ClipboardList },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-3 h-9 text-sm rounded-lg flex items-center gap-2 ${tab === t.k ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
              <t.i size={14} />{t.l}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <AdminDashboard analytics={analytics} projects={projects} clients={clients} onClick={setActive} />}
        {tab === 'pipeline' && <Kanban projects={projects} onMove={moveCard} onCardClick={setActive} role="Admin" />}
        {tab === 'clients' && <ClientsTab clients={clients} onRefresh={refresh} />}
        {tab === 'users' && <UsersTab users={users} clients={clients} onRefresh={refresh} />}
        {tab === 'audit' && <AuditTab logs={logs} />}
      </div>

      <AnimatePresence>{active && <ProjectDrawer project={active} onClose={() => setActive(null)} role="Admin" onChanged={refresh} />}</AnimatePresence>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, tone = 'zinc' }) {
  const tones = {
    zinc: 'text-zinc-300', blue: 'text-blue-300', red: 'text-red-300',
    emerald: 'text-emerald-300', amber: 'text-amber-300', violet: 'text-violet-300',
  }
  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
        <Icon size={16} className={tones[tone]} />
      </div>
      <div className="text-3xl font-semibold font-mono">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </GlassCard>
  )
}

function AdminDashboard({ analytics, projects, clients, onClick }) {
  if (!analytics) return <div className="text-sm text-zinc-500">Loading…</div>
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package} label="Active Projects" value={analytics.totals.projects} tone="blue" />
        <StatCard icon={Building2} label="Clients" value={analytics.totals.clients} tone="emerald" />
        <StatCard icon={Users} label="Users" value={analytics.totals.users} tone="violet" />
        <StatCard icon={ShieldAlert} label="Refly Flags" value={analytics.totals.refly} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">SLA Health</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
              <div className="text-xs text-emerald-300 mb-1">On track</div>
              <div className="text-2xl font-mono">{analytics.bySla.ok}</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
              <div className="text-xs text-amber-300 mb-1">Warning (&lt;4h)</div>
              <div className="text-2xl font-mono">{analytics.bySla.warning}</div>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/40 p-4">
              <div className="text-xs text-red-300 mb-1">Breached</div>
              <div className="text-2xl font-mono">{analytics.bySla.breached}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">By status</div>
            <div className="space-y-2">
              {Object.entries(analytics.byStatus).map(([k, v]) => {
                const total = Object.values(analytics.byStatus).reduce((a, b) => a + b, 0) || 1
                const pct = (v / total) * 100
                return (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[k]?.dot || 'bg-zinc-500'}`} />
                    <div className="w-32 text-zinc-300">{k}</div>
                    <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div className={`h-full ${STATUS_COLORS[k]?.dot || 'bg-zinc-500'}`} style={{ width: pct + '%' }} />
                    </div>
                    <div className="font-mono text-xs text-zinc-400 w-8 text-right">{v}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Clients</div>
          <div className="space-y-2">
            {analytics.byClient.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{c.name}</span>
                <span className="font-mono text-zinc-400">{c.count}</span>
              </div>
            ))}
            {analytics.byClient.length === 0 && <div className="text-xs text-zinc-600">No clients yet.</div>}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Recent Activity</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {projects.slice(0, 6).map(p => <ProjectCard key={p.id} p={p} role="Admin" onClick={onClick} />)}
          {projects.length === 0 && <div className="text-sm text-zinc-600">No projects yet — log in as <span className="font-mono">bayer</span> to create the first upload.</div>}
        </div>
      </GlassCard>
    </div>
  )
}

function ClientsTab({ clients, onRefresh }) {
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false)
  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try { await api('/clients', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); toast.success('Client created'); onRefresh() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  async function del(id) {
    if (!confirm('Delete this client?')) return
    try { await api(`/clients/${id}`, { method: 'DELETE' }); toast.success('Deleted'); onRefresh() } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Add new client</div>
        <div className="flex gap-2">
          <TextInput value={name} onChange={setName} placeholder="Client name (e.g., Tesla, Shell)" />
          <Btn onClick={create} disabled={busy || !name} icon={Plus}>Create</Btn>
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">All clients</div>
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/30 to-blue-500/30 flex items-center justify-center"><Building2 size={16} /></div>
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-[10px] font-mono text-zinc-600">{c.id.slice(0, 8)}</div>
                </div>
              </div>
              <button onClick={() => del(c.id)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

function UsersTab({ users, clients, onRefresh }) {
  const [form, setForm] = useState({ username: '', role: 'Team', client_id: '', password: '' })
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true)
    try {
      const r = await api('/users', { method: 'POST', body: JSON.stringify(form) })
      toast.success(`Created ${r.user.username}. Default password: ${r.default_password}`, { duration: 6000 })
      setForm({ username: '', role: 'Team', client_id: '', password: '' }); onRefresh()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  async function del(id, username) {
    if (!confirm(`Delete user ${username}?`)) return
    try { await api(`/users/${id}`, { method: 'DELETE' }); toast.success('Deleted'); onRefresh() } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Add user</div>
        <div className="grid md:grid-cols-4 gap-2">
          <TextInput value={form.username} onChange={v => setForm({ ...form, username: v })} placeholder="username" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm">
            <option>Admin</option><option>Team</option><option>Client</option>
          </select>
          {form.role === 'Client' ? (
            <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm">
              <option value="">Pick client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : <div />}
          <Btn onClick={create} disabled={busy || !form.username} icon={Plus}>Create</Btn>
        </div>
        <div className="text-[10px] text-zinc-600 mt-2">Default password: <span className="font-mono">WelcometoAlti@123</span> · forced reset on first login.</div>
      </GlassCard>
      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">All users</div>
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center"><User size={16} /></div>
                <div>
                  <div className="font-medium flex items-center gap-2">{u.username}
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{u.role}</span>
                    {u.must_change_password && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">Reset pending</span>}
                  </div>
                  {u.client_name && <div className="text-[11px] text-zinc-500">{u.client_name}</div>}
                </div>
              </div>
              {u.username !== 'devbond01' && <button onClick={() => del(u.id, u.username)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

function AuditTab({ logs }) {
  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">System audit log (immutable)</div>
      <div className="space-y-1">
        {logs.map(l => (
          <div key={l.id} className="flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-zinc-200">{l.action_desc}</div>
              <div className="text-[11px] text-zinc-600 font-mono">{new Date(l.timestamp).toLocaleString()} · {l.username} · {l.project_id?.slice(0, 8)}</div>
            </div>
          </div>
        ))}
        {logs.length === 0 && <div className="text-sm text-zinc-600">No events yet.</div>}
      </div>
    </GlassCard>
  )
}

// ============== TEAM APP ==============
function TeamApp({ user, onLogout }) {
  const [projects, setProjects] = useState([])
  const [active, setActive] = useState(null)
  async function refresh() {
    try { const r = await api('/projects'); setProjects(r.projects) } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { refresh() }, [])
  async function moveCard(card, target) {
    try { await api(`/projects/${card.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: target }) }); toast.success(`Moved → ${target}`); refresh() }
    catch (e) { toast.error(e.message) }
  }
  return (
    <div className="min-h-screen relative">
      <Backdrop />
      <Topbar user={user} onLogout={onLogout} title="Pipeline" subtitle="Team Operations · Live Kanban" />
      <div className="px-4 md:px-8 py-6 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-zinc-400">Drag cards between stages. <span className="text-zinc-600">Refly cards are locked until resolved.</span></div>
          <Btn variant="ghost" size="sm" onClick={refresh} icon={RefreshCw}>Refresh</Btn>
        </div>
        <Kanban projects={projects} onMove={moveCard} onCardClick={setActive} role="Team" />
      </div>
      <AnimatePresence>{active && <ProjectDrawer project={active} onClose={() => setActive(null)} role="Team" onChanged={refresh} />}</AnimatePresence>
    </div>
  )
}

// ============== CLIENT APP ==============
function ClientApp({ user, onLogout }) {
  const [tab, setTab] = useState('upload')
  const [projects, setProjects] = useState([])
  const [active, setActive] = useState(null)
  async function refresh() { try { const r = await api('/projects'); setProjects(r.projects) } catch (e) { toast.error(e.message) } }
  useEffect(() => { refresh() }, [])

  return (
    <div className="min-h-screen relative pb-24">
      <Backdrop />
      <Topbar user={user} onLogout={onLogout} title={user.client?.name || 'Client Portal'} subtitle="Upload · Track · Confirm" />

      {/* Desktop tabs */}
      <div className="hidden md:flex px-8 pt-6 gap-1">
        <button onClick={() => setTab('upload')} className={`px-4 h-10 text-sm rounded-lg flex items-center gap-2 ${tab === 'upload' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800/50'}`}><Upload size={14} />New Upload</button>
        <button onClick={() => setTab('projects')} className={`px-4 h-10 text-sm rounded-lg flex items-center gap-2 ${tab === 'projects' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800/50'}`}><Layers size={14} />My Projects ({projects.length})</button>
      </div>

      <div className="px-4 md:px-8 py-6 relative z-10">
        {tab === 'upload' && (
          <GlassCard className="p-6 md:p-8">
            <div className="mb-6">
              <div className="text-xl font-semibold">New Drone Upload</div>
              <div className="text-sm text-zinc-500">Submit drone data — SLA will be auto-calculated based on today's volume.</div>
            </div>
            <UploadForm clientId={user.client_id} onDone={() => { refresh(); setTab('projects') }} />
          </GlassCard>
        )}
        {tab === 'projects' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map(p => <ProjectCard key={p.id} p={p} onClick={setActive} role="Client" />)}
            {projects.length === 0 && <div className="col-span-full text-sm text-zinc-500 text-center py-12">No projects yet. Hit <span className="font-mono">New Upload</span> to begin.</div>}
          </div>
        )}
      </div>

      {/* Mobile bottom-sheet nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-strong border-t border-zinc-800 px-4 py-3 flex gap-2">
        <button onClick={() => setTab('upload')} className={`flex-1 h-14 rounded-xl flex flex-col items-center justify-center fat-input ${tab === 'upload' ? 'bg-white text-zinc-900' : 'bg-zinc-900/60 text-zinc-300'}`}>
          <Upload size={18} />
          <div className="text-[10px] mt-0.5 font-medium">Upload</div>
        </button>
        <button onClick={() => setTab('projects')} className={`flex-1 h-14 rounded-xl flex flex-col items-center justify-center fat-input ${tab === 'projects' ? 'bg-white text-zinc-900' : 'bg-zinc-900/60 text-zinc-300'}`}>
          <Layers size={18} />
          <div className="text-[10px] mt-0.5 font-medium">Projects ({projects.length})</div>
        </button>
      </div>

      <AnimatePresence>{active && <ProjectDrawer project={active} onClose={() => setActive(null)} role="Client" onChanged={refresh} />}</AnimatePresence>
    </div>
  )
}

// ============== ROOT ==============
function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadMe() {
    setLoading(true)
    try {
      if (!getToken()) { setUser(null); setLoading(false); return }
      const r = await api('/auth/me')
      setUser(r.user)
    } catch (e) {
      clearToken(); setUser(null)
    } finally { setLoading(false) }
  }
  useEffect(() => { loadMe() }, [])

  function logout() { clearToken(); setUser(null); toast.success('Signed out') }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <Backdrop />
        <PeriodSwitcher />
        <div className="text-zinc-300 text-sm flex items-center gap-2 px-4 py-2 rounded-full glass"><RefreshCw className="animate-spin" size={14} /> Loading Altiflow…</div>
      </div>
    )
  }
  if (!user) return <><Login onLogin={setUser} /><PeriodSwitcher /></>
  if (user.must_change_password) return <><ChangePassword user={user} onDone={loadMe} /><PeriodSwitcher /></>
  if (user.role === 'Admin') return <><AdminApp user={user} onLogout={logout} /><PeriodSwitcher /></>
  if (user.role === 'Team') return <><TeamApp user={user} onLogout={logout} /><PeriodSwitcher /></>
  if (user.role === 'Client') return <><ClientApp user={user} onLogout={logout} /><PeriodSwitcher /></>
  return <div>Unknown role</div>
}

export default App
