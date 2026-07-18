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
  FolderOpen, Download, Folder, FileText, Eye, EyeOff,
} from 'lucide-react'

// ============== API HELPER ==============
function getToken() {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('altiflow_token')
}
function setToken(t) {
  sessionStorage.setItem('altiflow_token', t)
  // Remove any older persistent token so browser re-open requires sign-in.
  localStorage.removeItem('altiflow_token')
}
function clearToken() {
  sessionStorage.removeItem('altiflow_token')
  localStorage.removeItem('altiflow_token')
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`/api${path}`, { cache: 'no-store', ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const uiListCache = new Map()
function getUiListCache(key) {
  const hit = uiListCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    uiListCache.delete(key)
    return null
  }
  return hit.value
}
function setUiListCache(key, value, ttlMs = 10000) {
  uiListCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}
function clearUiListCache(prefix) {
  for (const key of uiListCache.keys()) {
    if (key.startsWith(prefix)) uiListCache.delete(key)
  }
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([String(content || '')], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || 'altiflow-passkey.key'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function readUploadedFile(file) {
  if (!file) return ''
  return file.text()
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

function TextInput({ value, onChange, placeholder, type = 'text', big = false, className = '', ...rest }) {
  const [showPassword, setShowPassword] = useState(false)
  if (type === 'password') {
    return (
      <div className="relative w-full">
        <input type={showPassword ? 'text' : 'password'} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-10 ${big ? 'h-14 text-base fat-input' : 'h-11 text-sm'} text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition ${className}`}
          {...rest} />
        <button type="button" onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 focus:outline-none flex items-center justify-center">
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    )
  }
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 ${big ? 'h-14 text-base fat-input' : 'h-11 text-sm'} text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition ${className}`}
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
  const [forgotMode, setForgotMode] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [passkeyFile, setPasskeyFile] = useState(null)
  const [passkeyFileContent, setPasskeyFileContent] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(null)

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setSetup).catch(() => {})
  }, [])

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

  async function submitForgot(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ username, key_file_content: passkeyFileContent, new_password: newPassword }),
      })
      toast.success('Password reset successful. Sign in with your new password.')
      setForgotMode(false)
      setPassword(newPassword)
      setPasskeyFile(null)
      setPasskeyFileContent('')
      setNewPassword('')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  function quick(u, p) { setUsername(u); setPassword(p) }

  const showSetup = setup && setup.tables_ready === false
  const projectRef = setup?.supabase_url ? setup.supabase_url.match(/https?:\/\/([^.]+)/)?.[1] : null
  const sqlEditorUrl = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <Backdrop />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="mb-3">
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent select-none">
              Altiflow
            </h1>
          </motion.div>
          <div className="text-sm text-zinc-400">UAV Project Management & Operations, Simplified</div>
        </div>

        {showSetup && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-amber-300 font-medium mb-2">
              <AlertTriangle size={16} /> One-time Supabase setup required
            </div>
            <div className="text-xs text-zinc-300 mb-3">
              Your database tables haven't been created yet. Open the SQL Editor and paste the schema (one click).
            </div>
            <ol className="text-xs text-zinc-300 list-decimal list-inside space-y-1 mb-3">
              <li>Open <a href={sqlEditorUrl} target="_blank" rel="noopener" className="text-amber-300 underline">Supabase SQL Editor →</a></li>
              <li>Copy the contents of <code className="px-1 py-0.5 bg-zinc-800 rounded text-amber-200">supabase/schema.sql</code></li>
              <li>Paste → Run. Refresh this page.</li>
            </ol>
            <a href={sqlEditorUrl} target="_blank" rel="noopener"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 text-xs font-medium hover:bg-amber-400 transition">
              Open SQL Editor <ArrowRight size={12} />
            </a>
          </motion.div>
        )}

        <GlassCard className="p-8">
          <form onSubmit={forgotMode ? submitForgot : submit} className="space-y-4">
            <Field label="User ID">
              <TextInput value={username} onChange={setUsername} placeholder="username" />
            </Field>
            {!forgotMode ? (
              <>
                <Field label="Password">
                  <div className="relative">
                    <TextInput value={password} onChange={setPassword} type={showPwd ? 'text' : 'password'} placeholder="••••••••" className="pr-10" />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
                <Btn type="submit" disabled={busy || !username || !password} className="w-full mt-2">
                  {busy ? 'Authenticating…' : 'Sign in'}
                  <ArrowRight size={16} />
                </Btn>
              </>
            ) : (
              <>
                <Field label="Passkey File" hint="Upload the encrypted passkey file you saved earlier.">
                  <input
                    type="file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null
                      setPasskeyFile(file)
                      if (!file) {
                        setPasskeyFileContent('')
                        return
                      }
                      try {
                        const text = await readUploadedFile(file)
                        setPasskeyFileContent(text)
                      } catch {
                        setPasskeyFileContent('')
                        toast.error('Unable to read passkey file')
                      }
                    }}
                    className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200"
                  />
                  {passkeyFile && <div className="text-[11px] text-zinc-500 mt-1">Selected: {passkeyFile.name}</div>}
                </Field>
                <Field label="New Password" hint="At least 6 characters.">
                  <TextInput value={newPassword} onChange={setNewPassword} type="password" placeholder="••••••••" />
                </Field>
                <Btn type="submit" disabled={busy || !username || !passkeyFileContent || newPassword.length < 6} className="w-full mt-2">
                  {busy ? 'Resetting…' : 'Reset Password'}
                  <ArrowRight size={16} />
                </Btn>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setForgotMode(v => !v)
                setPasskeyFile(null)
                setPasskeyFileContent('')
                setNewPassword('')
              }}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {forgotMode ? 'Back to sign in' : 'Forgot password? Reset with passkey file'}
            </button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}

// ============== FORCE PASSWORD CHANGE ==============
function ChangePassword({ user, onDone }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [passkeyFile, setPasskeyFile] = useState(null)
  const [passkeyFileContent, setPasskeyFileContent] = useState('')
  const [generatedPasskey, setGeneratedPasskey] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = { current_password: current, new_password: next }
      if (!user.must_change_password) payload.key_file_content = passkeyFileContent
      const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) })
      if (r.passkey_file?.file_content) {
        setGeneratedPasskey(r.passkey_file)
        downloadTextFile(r.passkey_file.file_name, r.passkey_file.file_content)
        toast.success('Password updated. Your passkey file has been downloaded. Store it safely.', { duration: 9000 })
      } else {
        toast.success('Password updated.')
      }
      onDone()
    } catch (e) {
      const msg = String(e.message || '')
      if (msg.includes('schema.sql')) {
        toast.error('Database migration missing. Run supabase/schema.sql first, then retry password update.')
      } else {
        toast.error(msg || 'Failed to update password')
      }
    } finally { setBusy(false) }
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
            {user.must_change_password && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                After successful update, your encrypted passkey file will auto-download.
                Keep it safe. You must upload it for future password resets.
              </div>
            )}
            {!user.must_change_password && (
              <Field label="Passkey file" hint="Required for password changes after first-time setup.">
                <input
                  type="file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0] || null
                    setPasskeyFile(file)
                    if (!file) {
                      setPasskeyFileContent('')
                      return
                    }
                    try {
                      const text = await readUploadedFile(file)
                      setPasskeyFileContent(text)
                    } catch {
                      setPasskeyFileContent('')
                      toast.error('Unable to read passkey file')
                    }
                  }}
                  className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200"
                />
                {passkeyFile && <div className="text-[11px] text-zinc-500 mt-1">Selected: {passkeyFile.name}</div>}
              </Field>
            )}
            <Btn type="submit" disabled={busy || (!user.must_change_password && !passkeyFileContent)} className="w-full">{busy ? 'Updating…' : 'Update password'}</Btn>
            {generatedPasskey?.file_content && (
              <button
                type="button"
                onClick={() => downloadTextFile(generatedPasskey.file_name, generatedPasskey.file_content)}
                className="w-full text-xs text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
              >
                Download passkey file again
              </button>
            )}
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
          {!['Client-Admin', 'Client-User'].includes(role) && (
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
        {!['Client-Admin', 'Client-User'].includes(role) && p.assignee_name && (
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
    if (role === 'Client-Admin') return
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

  async function deleteLegacyProject() {
    if (role !== 'Super-Admin') return
    if (!confirm('Delete this project card? It can be restored from Bin.')) return
    setBusy(true)
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' })
      toast.success('Project moved to Bin')
      onChanged()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function requestLegacyProjectDelete() {
    if (role !== 'Admin') return
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    setBusy(true)
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'project', entity_id: project.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted to Super Admin')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
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
          <div className="flex items-center gap-2">
            {role === 'Super-Admin' && (
              <button onClick={deleteLegacyProject} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg" title="Delete project card">
                <Trash2 size={14} />
              </button>
            )}
            {role === 'Admin' && (
              <button onClick={requestLegacyProjectDelete} className="p-2 hover:bg-amber-500/10 text-amber-300 rounded-lg" title="Request project delete">
                <FileWarning size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg"><X size={18} /></button>
          </div>
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

          {!['Client-Admin', 'Client-User'].includes(role) && project.refly_reason && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-center gap-2 text-red-300 mb-1"><ShieldAlert size={14} /> Refly Trigger</div>
              <div className="text-sm text-zinc-300">{project.refly_reason}</div>
              {project.assignee_name && <div className="text-xs text-zinc-500 mt-1">Auto-assigned to {project.assignee_name} (round-robin)</div>}
            </div>
          )}

          {locked && role === 'Admin' && (
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

          {project.refly_resolved && project.issue_note && !['Client-Admin', 'Client-User'].includes(role) && (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 text-emerald-300 mb-2"><CheckCircle2 size={14} /> Refly resolved</div>
              <div className="text-sm text-zinc-300">{project.issue_note}</div>
              {project.issue_photo && <img src={project.issue_photo} alt="" className="mt-3 rounded-lg max-h-40 border border-zinc-800" />}
            </GlassCard>
          )}

          {['Client-Admin', 'Client-User'].includes(role) && project.status === 'Delivery' && !project.delivery_confirmed && (
            <Btn variant="success" size="lg" onClick={confirmDelivery} disabled={busy} icon={CheckCircle2}>Confirm Delivery</Btn>
          )}
          {['Client-Admin', 'Client-User'].includes(role) && project.delivery_confirmed && (
            <div className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 size={14} /> Delivery confirmed</div>
          )}

          {role !== 'Client-Admin' && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                {role === 'Client-User' ? 'Job Card Log' : 'Audit Trail'}
              </div>
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
function Topbar({ user, onLogout, onEditProfile, title, subtitle }) {
  return (
    <div className="sticky top-0 z-30 glass-strong border-b border-zinc-800/60">
      <div className="px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center shrink-0 select-none">
            <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">Altiflow</span>
          </div>
          <div className="h-5 w-[1px] bg-zinc-800/60 hidden sm:block shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold truncate text-zinc-100">{title || 'Altiflow'}</div>
            {subtitle && <div className="text-[11px] text-zinc-500 truncate">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PeriodChip />
          <button onClick={onEditProfile} className="hidden md:flex items-center gap-2 text-xs text-zinc-400 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 hover:border-white/20 transition cursor-pointer" title="Edit Profile">
            <User size={12} />{user.username}
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">{user.role}</span>
          </button>
          <Btn onClick={onLogout} variant="ghost" size="sm" icon={LogOut}>Sign out</Btn>
        </div>
      </div>
    </div>
  )
}

// ============== ADMIN APP (Super-Admin full / Admin restricted) ==============
function AdminApp({ user, onLogout, onEditProfile }) {
  const isSuperAdmin = user.role === 'Super-Admin'
  const [tab, setTab] = useState('dashboard')
  const [projects, setProjects] = useState([])
  const [clientProjects, setClientProjects] = useState([])
  const [assignedJobs, setAssignedJobs] = useState([])
  const [clients, setClients] = useState([])
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [deletionRequests, setDeletionRequests] = useState([])
  const [recycleItems, setRecycleItems] = useState([])
  const [active, setActive] = useState(null)
  const [activeClientProject, setActiveClientProject] = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('altiflow_admin_tab')
      if (savedTab) setTab(savedTab)
      const savedActive = localStorage.getItem('altiflow_admin_active_proj')
      if (savedActive) setActive(JSON.parse(savedActive))
      const savedClientActive = localStorage.getItem('altiflow_admin_active_client_proj')
      if (savedClientActive) setActiveClientProject(JSON.parse(savedClientActive))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('altiflow_admin_tab', tab)
  }, [tab])

  useEffect(() => {
    if (active) {
      localStorage.setItem('altiflow_admin_active_proj', JSON.stringify(active))
    } else {
      localStorage.removeItem('altiflow_admin_active_proj')
    }
  }, [active])

  useEffect(() => {
    if (activeClientProject) {
      localStorage.setItem('altiflow_admin_active_client_proj', JSON.stringify(activeClientProject))
    } else {
      localStorage.removeItem('altiflow_admin_active_client_proj')
    }
  }, [activeClientProject])
  const assignedJobsCacheRef = useRef(new Map())

  async function loadAuditLogs(force = false) {
    const cacheKey = `audit-logs:${user.id}:${user.role}`
    if (!force) {
      const cached = getUiListCache(cacheKey)
      if (cached) {
        setLogs(cached)
        return
      }
    }
    const al = await api('/audit-logs?limit=120')
    const nextLogs = al.logs || []
    setLogs(nextLogs)
    setUiListCache(cacheKey, nextLogs, 10000)
  }

  async function refreshAssignedJobsOnly() {
    try {
      const cacheKey = user.role === 'Admin' ? `jobs-assigned:${user.id}` : 'jobs-assigned:super-admin'
      const cached = assignedJobsCacheRef.current.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        setAssignedJobs(cached.value)
        return
      }
      const aj = await api('/jobs-assigned?limit=500')
      setAssignedJobs(aj.jobs || [])
      assignedJobsCacheRef.current.set(cacheKey, { value: aj.jobs || [], expiresAt: Date.now() + 10000 })
    } catch (e) { toast.error(e.message) }
  }

  async function refresh() {
    try {
      const [pRes, cRes, uRes, aRes] = await Promise.allSettled([
        api('/projects'), api('/clients'), api('/users'), api('/analytics'),
      ])
      if (pRes.status === 'fulfilled') setProjects(pRes.value.projects || [])
      if (cRes.status === 'fulfilled') setClients(cRes.value.clients || [])
      if (uRes.status === 'fulfilled') setUsers(uRes.value.users || [])
      if (aRes.status === 'fulfilled') setAnalytics(aRes.value)
      const firstErr = [pRes, cRes, uRes, aRes].find(r => r.status === 'rejected')
      if (firstErr) toast.error(firstErr.reason?.message || 'Some data failed to load')
      const cp = await api('/client-projects')
      setClientProjects(cp.projects || [])
      if (['assigned', 'pipeline'].includes(tab)) {
        const aj = await api('/jobs-assigned')
        setAssignedJobs(aj.jobs || [])
      }
      if (tab === 'audit') {
        await loadAuditLogs()
      }
      if (isSuperAdmin && tab === 'deletions') {
        const dr = await api('/deletion-requests'); setDeletionRequests(dr.requests)
      }
      if (isSuperAdmin && tab === 'bin') {
        const rb = await api('/recycle-bin'); setRecycleItems(rb.items || [])
      }
    } catch (e) { toast.error(e.message) }
  }

  async function refreshDashboardMetrics() {
    try {
      const [a, p, cp] = await Promise.all([
        api('/analytics'),
        api('/projects?limit=100'),
        api('/client-projects?limit=100'),
      ])
      setAnalytics(a)
      setProjects(p.projects || [])
      setClientProjects(cp.projects || [])
    } catch {}
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { if (tab === 'audit') loadAuditLogs().catch(() => {}) }, [tab])
  useEffect(() => { if (isSuperAdmin && tab === 'deletions') api('/deletion-requests').then(r => setDeletionRequests(r.requests)).catch(() => {}) }, [tab])
  useEffect(() => { if (isSuperAdmin && tab === 'bin') api('/recycle-bin').then(r => setRecycleItems(r.items || [])).catch(() => {}) }, [tab])
  useEffect(() => {
    if (tab !== 'users') return
    api('/users').then(u => setUsers(u.users || [])).catch(e => toast.error(e.message))
  }, [tab])
  useEffect(() => {
    if (!['assigned', 'pipeline'].includes(tab)) return
    refreshAssignedJobsOnly()
  }, [tab])
  useEffect(() => {
    if (tab !== 'dashboard') return
    refreshDashboardMetrics()
    const t = setInterval(() => {
      refreshDashboardMetrics()
    }, 30000)
    return () => clearInterval(t)
  }, [tab])

  async function moveJobCard(card, target) {
    try {
      const stageField = card.category === 'Uniformity' ? 'uni_status' : 'sc_status'
      const dbStage = toDbJobStage(target)
      await api(`/client-projects/${card.project_id}/jobs/${card.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          [stageField]: dbStage,
        }),
      })
      toast.success(`Job moved → ${target}`)
      refreshAssignedJobsOnly()
    } catch (e) {
      const statusFallback = {
        'Pending': 'Open',
        'In Progress': 'In Progress',
        'Done': 'Done',
        'Cancelled': 'Blocked',
      }
      const mappedStatus = statusFallback[target]
      if (!mappedStatus) {
        toast.error(e.message)
        return
      }

      try {
        await api(`/client-projects/${card.project_id}/jobs/${card.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: mappedStatus }),
        })
        toast.success(`Job moved → ${target}`)
        refreshAssignedJobsOnly()
      } catch (fallbackErr) {
        toast.error(fallbackErr.message || e.message)
      }
    }
  }

  const tabs = [
    { k: 'dashboard', l: 'Dashboard', i: BarChart3 },
    { k: 'assigned', l: 'Assigned Jobs', i: ClipboardList },
    { k: 'pipeline', l: 'Pipeline', i: Layers },
    { k: 'workspaces', l: 'Client Workspaces', i: FolderOpen },
    { k: 'clients', l: 'Clients', i: Building2 },
    { k: 'users', l: 'Users', i: Users },
    { k: 'support', l: 'Support Tickets', i: Bell },
    { k: 'audit', l: 'Audit Logs', i: ClipboardList },
    ...(isSuperAdmin ? [{ k: 'deletions', l: 'Deletion Queue', i: Trash2 }] : []),
    ...(isSuperAdmin ? [{ k: 'deleteRequests', l: 'Delete Requests', i: FileWarning }] : []),
    ...(isSuperAdmin ? [{ k: 'bin', l: 'Bin', i: Folder }] : []),
  ]

  if (activeClientProject) {
    return (
      <ProjectDetailPage
        project={activeClientProject}
        user={user}
        orgUsers={users}
        onBack={() => setActiveClientProject(null)}
        onLogout={onLogout}
        onRefresh={refresh}
        showDashboard={true}
        showBack={true}
        showProjectSwitcher={true}
        projects={clientProjects}
        onSwitchProject={projectId => {
          const next = clientProjects.find(p => p.id === projectId)
          if (next) setActiveClientProject(next)
        }}
        onEditProfile={onEditProfile}
      />
    )
  }

  return (
    <div className="min-h-screen relative">
      <Backdrop />
      <Topbar user={user} onLogout={onLogout} onEditProfile={onEditProfile} title="Command Center" subtitle={`${user.role} · Global View`} />
      <div className="px-4 md:px-8 py-6 relative z-10">
        <div className="flex items-center gap-1 mb-6 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-3 h-9 text-sm rounded-lg flex items-center gap-2 ${tab === t.k ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
              <t.i size={14} />{t.l}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <AdminDashboard analytics={analytics} projects={projects} clientProjects={clientProjects} clients={clients} onClick={setActive} onOpenWorkspace={setActiveClientProject} />}
        {tab === 'assigned' && <AssignedJobsTab jobs={assignedJobs} onOpenWorkspaceById={projectId => {
          const next = clientProjects.find(p => p.id === projectId)
          if (next) setActiveClientProject(next)
        }} />}
        {tab === 'pipeline' && (
          <div className="space-y-5">
            <JobPipelineKanban
              jobs={assignedJobs}
              onMove={moveJobCard}
              onOpenWorkspaceById={projectId => {
                const next = clientProjects.find(p => p.id === projectId)
                if (next) setActiveClientProject(next)
              }}
            />
          </div>
        )}
        {tab === 'workspaces' && <InternalClientWorkspacesTab projects={clientProjects} onOpen={setActiveClientProject} user={user} onRefresh={refresh} />}
        {tab === 'clients' && <ClientsTab clients={clients} onRefresh={refresh} isSuperAdmin={isSuperAdmin} />}
        {tab === 'users' && <UsersTab users={users} clients={clients} onRefresh={refresh} isSuperAdmin={isSuperAdmin} />}
        {tab === 'support' && <SupportTicketsTab user={user} />}
        {tab === 'audit' && <AuditTab logs={logs} />}
        {tab === 'deletions' && isSuperAdmin && <DeletionQueueTab requests={deletionRequests} onRefresh={refresh} />}
        {tab === 'deleteRequests' && isSuperAdmin && <EntityDeleteRequestsTab user={user} />}
        {tab === 'bin' && isSuperAdmin && <RecycleBinTab items={recycleItems} onRefresh={refresh} />}
      </div>

      <AnimatePresence>{active && <ProjectDrawer project={active} onClose={() => setActive(null)} role={user.role} onChanged={refresh} />}</AnimatePresence>
    </div>
  )
}

function InternalClientWorkspacesTab({ projects, onOpen, user, onRefresh }) {
  const canDelete = user?.role === 'Super-Admin'
  const canRequestDelete = user?.role === 'Admin'

  async function deleteWorkspace(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this workspace? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${id}`, { method: 'DELETE' })
      toast.success('Workspace moved to Bin')
      onRefresh?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function requestWorkspaceDelete(e, p) {
    e.stopPropagation()
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'client_project', entity_id: p.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted')
      onRefresh?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!projects?.length) {
    return (
      <GlassCard className="p-8 text-center">
        <div className="text-sm text-zinc-500">No client workspaces available yet.</div>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-3">
      {projects.map(p => (
        <button
          key={p.id}
          onClick={() => onOpen(p)}
          className="w-full text-left"
        >
          <GlassCard className="p-4 hover:border-zinc-600 transition-colors border border-zinc-800/70">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-zinc-100 truncate">{p.name}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {p.client_name || 'Unknown Client'} · {p.type} · {p.head}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canDelete && (
                  <button onClick={e => deleteWorkspace(e, p.id)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg" title="Delete workspace">
                    <Trash2 size={14} />
                  </button>
                )}
                {canRequestDelete && (
                  <button onClick={e => requestWorkspaceDelete(e, p)} className="p-2 hover:bg-amber-500/10 text-amber-300 rounded-lg" title="Request workspace delete">
                    <FileWarning size={14} />
                  </button>
                )}
                <ChevronRight size={16} className="text-zinc-600" />
              </div>
            </div>
          </GlassCard>
        </button>
      ))}
    </div>
  )
}

function AssignedJobsTab({ jobs, onOpenWorkspaceById }) {
  if (!jobs?.length) {
    return (
      <GlassCard className="p-8 text-center">
        <div className="text-sm text-zinc-500">No assigned job cards right now.</div>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map(j => (
        <GlassCard key={j.id} className="p-4 border border-zinc-800/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-zinc-100 truncate">{j.title}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {j.client_name || 'Unknown Client'} · {j.project_name || 'Unknown Project'}
              </div>
              <div className="text-[11px] text-zinc-600 mt-1">
                Category: {j.category || 'Stand Count'} · SC: {j.sc_status || 'Pending'} · Uni: {j.uni_status || 'Pending'}
              </div>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => onOpenWorkspaceById?.(j.project_id)} icon={ChevronRight}>Open</Btn>
          </div>
        </GlassCard>
      ))}
    </div>
  )
}

const JOB_PIPELINE_STAGES = ['Pending', 'In Progress', 'Done', 'Cancelled']

function toDbJobStage(stage) {
  return stage === 'Cancelled' ? 'Blocked' : stage
}

function toUiJobStage(stage) {
  return stage === 'Blocked' ? 'Cancelled' : (stage || 'Pending')
}

function getJobPipelineStage(job) {
  const stageByCategory = (job.category === 'Uniformity' ? job.uni_status : job.sc_status)
  if (stageByCategory) return toUiJobStage(stageByCategory)
  if (job.status === 'In Progress' || job.status === 'Done' || job.status === 'Blocked') return toUiJobStage(job.status)
  return 'Pending'
}

function JobPipelineCard({ job, onOpenWorkspaceById }) {
  const stage = getJobPipelineStage(job)
  const stageStyles = {
    'Pending': 'text-zinc-400 border-zinc-700/60 bg-zinc-800/50',
    'In Progress': 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    'Done': 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    'Cancelled': 'text-red-300 border-red-500/40 bg-red-500/10',
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `job-${job.id}` })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-xl border border-zinc-800/70 bg-zinc-900/45 p-3 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">{job.title}</div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">{job.client_name || 'Unknown Client'} · {job.project_name || 'Unknown Workspace'}</div>
        </div>
        <span className={`px-2 py-0.5 text-[10px] rounded border ${stageStyles[stage] || stageStyles['Pending']}`}>
          {stage}
        </span>
      </div>

      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600">
          {job.category || 'Stand Count'} · {job.assigned_to_name || 'Unassigned'}
        </div>
        <Btn
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onOpenWorkspaceById?.(job.project_id) }}
          icon={ChevronRight}
        >
          Open
        </Btn>
      </div>
    </motion.div>
  )
}

function JobPipelineColumn({ stage, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const dots = {
    'Pending': 'bg-blue-500',
    'In Progress': 'bg-amber-500',
    'Done': 'bg-emerald-500',
    'Cancelled': 'bg-red-500',
  }
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[280px] rounded-2xl border ${isOver ? 'border-zinc-500 bg-zinc-900/60' : 'border-zinc-800/60 bg-zinc-900/30'} backdrop-blur transition-colors`}
    >
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dots[stage] || 'bg-zinc-500'}`} />
          <div className="text-sm font-semibold text-zinc-200">{stage}</div>
        </div>
        <div className="text-xs font-mono text-zinc-500">{count}</div>
      </div>
      <div className="p-3 space-y-3 min-h-[200px]">{children}</div>
    </div>
  )
}

function JobPipelineKanban({ jobs, onMove, onOpenWorkspaceById }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [active, setActive] = useState(null)

  const grouped = useMemo(() => {
    const g = Object.fromEntries(JOB_PIPELINE_STAGES.map(s => [s, []]))
    for (const j of (jobs || [])) {
      const s = getJobPipelineStage(j)
      if (!g[s]) g[s] = []
      g[s].push(j)
    }
    return g
  }, [jobs])

  function onDragStart(event) {
    const id = String(event.active?.id || '')
    const jobId = id.startsWith('job-') ? id.slice(4) : id
    setActive((jobs || []).find(j => j.id === jobId) || null)
  }

  function onDragEnd(event) {
    setActive(null)
    if (!event.over) return
    const id = String(event.active?.id || '')
    const jobId = id.startsWith('job-') ? id.slice(4) : id
    const job = (jobs || []).find(j => j.id === jobId)
    const target = String(event.over.id)
    if (!job || !JOB_PIPELINE_STAGES.includes(target)) return
    if (getJobPipelineStage(job) === target) return
    onMove?.(job, target)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4">
        {JOB_PIPELINE_STAGES.map(stage => (
          <JobPipelineColumn key={stage} stage={stage} count={(grouped[stage] || []).length}>
            <AnimatePresence>
              {(grouped[stage] || []).map(job => (
                <JobPipelineCard key={job.id} job={job} onOpenWorkspaceById={onOpenWorkspaceById} />
              ))}
            </AnimatePresence>
            {(grouped[stage] || []).length === 0 && (
              <div className="text-center text-xs text-zinc-600 py-8 border border-dashed border-zinc-800/60 rounded-lg">Drop here</div>
            )}
          </JobPipelineColumn>
        ))}
      </div>
      <DragOverlay>
        {active && <div className="opacity-90"><JobPipelineCard job={active} onOpenWorkspaceById={onOpenWorkspaceById} /></div>}
      </DragOverlay>
    </DndContext>
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

function AdminDashboard({ analytics, projects, clientProjects, clients, onClick, onOpenWorkspace }) {
  if (!analytics) return <div className="text-sm text-zinc-500">Loading…</div>
  const safeBySla = analytics.bySla || { ok: 0, warning: 0, breached: 0 }
  const safeByStatus = analytics.byStatus || {}
  const safeByClient = analytics.byClient || []
  const workspaceCount = analytics.totals.client_workspaces ?? analytics.totals.projects ?? 0
  const monthly = analytics.fieldJobsByMonth || []
  const weekly = analytics.fieldJobsByWeek || []
  const maxMonth = Math.max(1, ...monthly.map(x => x.count || 0))
  const maxWeek = Math.max(1, ...weekly.map(x => x.count || 0))
  
  // New metrics
  const jobCardStats = analytics.jobCardStats || { stand_count: { total: 0, done: 0, in_progress: 0, blocked: 0, need_delivery: 0 }, uniformity: { total: 0, done: 0, in_progress: 0, blocked: 0, need_delivery: 0 } }
  const adminAssignments = analytics.adminAssignments || []
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package} label="Client Workspaces" value={workspaceCount} tone="blue" />
        <StatCard icon={Building2} label="Clients" value={analytics.totals.clients} tone="emerald" />
        <StatCard icon={ClipboardList} label="Field Jobs" value={analytics.totals.field_jobs || 0} tone="violet" />
        <StatCard icon={ShieldAlert} label="Refly Flags" value={analytics.totals.refly} tone="red" />
      </div>

      {/* Job Card Stats - Stand Count & Uniformity */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Stand Count Stats */}
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400" />Stand Count Jobs
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total Created</span>
              <span className="text-2xl font-bold text-violet-300">{jobCardStats.stand_count?.total || 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <div className="text-emerald-400 font-semibold text-lg">{jobCardStats.stand_count?.done || 0}</div>
                <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">Delivered</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-blue-400 font-semibold text-lg">{jobCardStats.stand_count?.in_progress || 0}</div>
                <div className="text-blue-400/60 text-[10px] uppercase tracking-wider">In Progress</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="text-amber-400 font-semibold text-lg">{jobCardStats.stand_count?.need_delivery || 0}</div>
                <div className="text-amber-400/60 text-[10px] uppercase tracking-wider">To Deliver</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-red-400 font-semibold text-lg">{jobCardStats.stand_count?.blocked || 0}</div>
                <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Blocked</div>
              </div>
            </div>
            {jobCardStats.stand_count?.total > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-[10px] text-zinc-500">Completion Rate</div>
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round((jobCardStats.stand_count?.done / jobCardStats.stand_count?.total) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Uniformity Stats */}
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />Uniformity Jobs
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total Created</span>
              <span className="text-2xl font-bold text-amber-300">{jobCardStats.uniformity?.total || 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <div className="text-emerald-400 font-semibold text-lg">{jobCardStats.uniformity?.done || 0}</div>
                <div className="text-emerald-400/60 text-[10px] uppercase tracking-wider">Delivered</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-blue-400 font-semibold text-lg">{jobCardStats.uniformity?.in_progress || 0}</div>
                <div className="text-blue-400/60 text-[10px] uppercase tracking-wider">In Progress</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="text-amber-400 font-semibold text-lg">{jobCardStats.uniformity?.need_delivery || 0}</div>
                <div className="text-amber-400/60 text-[10px] uppercase tracking-wider">To Deliver</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-red-400 font-semibold text-lg">{jobCardStats.uniformity?.blocked || 0}</div>
                <div className="text-red-400/60 text-[10px] uppercase tracking-wider">Blocked</div>
              </div>
            </div>
            {jobCardStats.uniformity?.total > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-[10px] text-zinc-500">Completion Rate</div>
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round((jobCardStats.uniformity?.done / jobCardStats.uniformity?.total) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">SLA Health</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
              <div className="text-xs text-emerald-300 mb-1">On track</div>
              <div className="text-2xl font-mono">{safeBySla.ok}</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
              <div className="text-xs text-amber-300 mb-1">Warning (&lt;4h)</div>
              <div className="text-2xl font-mono">{safeBySla.warning}</div>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/40 p-4">
              <div className="text-xs text-red-300 mb-1">Breached</div>
              <div className="text-2xl font-mono">{safeBySla.breached}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">By status</div>
            <div className="space-y-2">
              {Object.entries(safeByStatus).map(([k, v]) => {
                const total = Object.values(safeByStatus).reduce((a, b) => a + b, 0) || 1
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
            {safeByClient.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{c.name}</span>
                <span className="font-mono text-zinc-400">{c.count}</span>
              </div>
            ))}
            {safeByClient.length === 0 && <div className="text-xs text-zinc-600">No clients yet.</div>}
          </div>
        </GlassCard>
      </div>

      {/* Admin Assignments - Super Admin Only */}
      {adminAssignments && adminAssignments.length > 0 && (
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Admin Job Card Distribution</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-500">
                  <th className="text-left py-2 px-3">Admin Name</th>
                  <th className="text-center py-2 px-3">Total Jobs</th>
                  <th className="text-center py-2 px-3">Stand Count</th>
                  <th className="text-center py-2 px-3">Uniformity</th>
                  <th className="text-center py-2 px-3">Delivered</th>
                  <th className="text-center py-2 px-3">Projects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {adminAssignments.map(admin => {
                  const projectCount = Object.keys(admin.projects || {}).length
                  const deliveryRate = admin.total_jobs > 0 ? Math.round((admin.done_count / admin.total_jobs) * 100) : 0
                  return (
                    <tr key={admin.admin_id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-3 font-medium text-zinc-100">{admin.admin_name}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-violet-300">{admin.total_jobs}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-blue-300">{admin.sc_count}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-amber-300">{admin.uni_count}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-emerald-300 font-medium">{admin.done_count}</span>
                        <div className="text-[9px] text-zinc-500">{deliveryRate}%</div>
                      </td>
                      <td className="py-3 px-3 text-center text-zinc-400">{projectCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

function ClientsTab({ clients, onRefresh, isSuperAdmin }) {
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false)
  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try { await api('/clients', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); toast.success('Client created'); onRefresh() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  async function del(id) {
    if (!confirm('Delete this client? It can be restored from Bin.')) return
    try { await api(`/clients/${id}`, { method: 'DELETE' }); toast.success('Moved to Bin'); onRefresh() } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Add new client</div>
          <div className="flex gap-2">
            <TextInput value={name} onChange={setName} placeholder="Client name (e.g., Tesla, Shell)" />
            <Btn onClick={create} disabled={busy || !name} icon={Plus}>Create</Btn>
          </div>
        </GlassCard>
      )}
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
              {isSuperAdmin && <button onClick={() => del(c.id)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

function UsersTab({ users, clients, onRefresh, isSuperAdmin }) {
  const [form, setForm] = useState({ username: '', role: 'Admin', client_id: '', password: '' })
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true)
    try {
      const r = await api('/users', { method: 'POST', body: JSON.stringify(form) })
      toast.success(`Created ${r.user.username}. Default password: ${r.default_password}`, { duration: 6000 })
      setForm({ username: '', role: 'Admin', client_id: '', password: '' }); onRefresh()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  async function del(id, username) {
    if (!confirm(`Delete user ${username}? It can be restored from Bin.`)) return
    try { await api(`/users/${id}`, { method: 'DELETE' }); toast.success('Moved to Bin'); onRefresh() } catch (e) { toast.error(e.message) }
  }

  async function resetPassword(id, username) {
    const input = window.prompt(`Set temporary password for ${username} (leave blank to use default):`, '')
    if (input === null) return
    try {
      const body = input.trim() ? { new_password: input.trim() } : {}
      const r = await api(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify(body) })
      toast.success(`Temporary password for ${r.username}: ${r.temporary_password}`, { duration: 8000 })
      onRefresh()
    } catch (e) { toast.error(e.message) }
  }

  async function generatePasscode(id, username) {
    try {
      const r = await api(`/users/${id}/reset-passcode`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (r.passkey_file?.file_content) {
        downloadTextFile(r.passkey_file.file_name, r.passkey_file.file_content)
      }
      toast.success(`Passkey file regenerated for ${r.username}. Share the downloaded file securely.`, { duration: 9000 })
    } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <GlassCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Add user</div>
          <div className="grid md:grid-cols-4 gap-2">
            <TextInput value={form.username} onChange={v => setForm({ ...form, username: v })} placeholder="username" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm">
              <option>Super-Admin</option><option>Admin</option><option>Client-Admin</option><option>Client-User</option>
            </select>
            {['Client-Admin', 'Client-User'].includes(form.role) ? (
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm">
                <option value="">Pick client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : <div />}
            <Btn onClick={create} disabled={busy || !form.username} icon={Plus}>Create</Btn>
          </div>
          <div className="text-[10px] text-zinc-600 mt-2">Default password: <span className="font-mono">WelcometoAlti@123</span> · forced reset on first login.</div>
        </GlassCard>
      )}
      <GlassCard className="p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">All users</div>
        {users.length === 0 && (
          <div className="text-sm text-zinc-500 py-6 text-center">No users found. Try refreshing.</div>
        )}
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
              {isSuperAdmin && u.username !== 'devbond01' && (
                <div className="flex items-center gap-2">
                  <Btn size="sm" variant="ghost" onClick={() => generatePasscode(u.id, u.username)}>
                    Key File
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => resetPassword(u.id, u.username)}>
                    Reset Pwd
                  </Btn>
                  <button onClick={() => del(u.id, u.username)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg"><Trash2 size={14} /></button>
                </div>
              )}
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

// ============== DELETION QUEUE TAB (Super-Admin only) ==============
function DeletionQueueTab({ requests, onRefresh }) {
  const [busy, setBusy] = useState(null)
  async function resolve(id, action) {
    setBusy(id)
    try {
      await api(`/deletion-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      toast.success(action === 'approve' ? 'User deleted.' : 'Request rejected.')
      onRefresh()
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Pending user deletion requests</div>
      {requests.length === 0 && <div className="text-sm text-zinc-600">No pending requests.</div>}
      <div className="space-y-3">
        {requests.map(r => (
          <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40">
            <div>
              <div className="font-medium flex items-center gap-2">
                <User size={14} className="text-zinc-400" />{r.target_username}
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{r.target_role}</span>
                {r.target_client && <span className="text-[10px] text-zinc-500">{r.target_client}</span>}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Requested by <span className="text-zinc-300">{r.requested_by_username}</span> · {new Date(r.created_at).toLocaleString()}</div>
              {r.reason && <div className="text-xs text-zinc-400 mt-1">Reason: {r.reason}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Btn variant="danger" size="sm" disabled={busy === r.id} onClick={() => resolve(r.id, 'approve')}>Approve</Btn>
              <Btn variant="ghost" size="sm" disabled={busy === r.id} onClick={() => resolve(r.id, 'reject')}>Reject</Btn>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

function RecycleBinTab({ items, onRefresh }) {
  const [restoring, setRestoring] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function restoreItem(id) {
    setRestoring(id)
    try {
      await api(`/recycle-bin/${id}/restore`, { method: 'POST' })
      toast.success('Item restored')
      onRefresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setRestoring(null)
    }
  }

  async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this permanently? This action cannot be undone.')) return
    setDeleting(id)
    try {
      await api(`/recycle-bin/${id}`, { method: 'DELETE' })
      toast.success('Item permanently deleted')
      onRefresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Recycle Bin</div>
      {items.length === 0 && <div className="text-sm text-zinc-600">Bin is empty.</div>}
      <div className="space-y-3">
        {items.map(item => {
          const payload = item.payload || {}
          const label = payload.name || payload.title || payload.username || payload.id || item.entity_id
          const restored = !!item.restored_at
          return (
            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 gap-3">
              <div className="min-w-0">
                <div className="font-medium text-zinc-100 truncate">{label}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {item.entity_type} · deleted by {item.deleted_by_username || 'system'} · {new Date(item.deleted_at).toLocaleString()}
                </div>
                {restored && (
                  <div className="text-[11px] text-emerald-300 mt-1">
                    Restored by {item.restored_by_username || 'system'} · {new Date(item.restored_at).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Btn
                  variant="ghost"
                  size="sm"
                  disabled={restored || restoring === item.id || deleting === item.id}
                  onClick={() => restoreItem(item.id)}
                >
                  {restored ? 'Restored' : restoring === item.id ? 'Restoring...' : 'Restore'}
                </Btn>
                {!restored && (
                  <Btn
                    variant="danger"
                    size="sm"
                    disabled={restoring === item.id || deleting === item.id}
                    onClick={() => deleteItem(item.id)}
                  >
                    {deleting === item.id ? 'Deleting...' : 'Delete'}
                  </Btn>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

function EntityDeleteRequestsTab({ user }) {
  const canReview = ['Super-Admin', 'Client-Admin'].includes(user.role)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api('/entity-delete-requests')
      setRequests(r.requests || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function resolve(id, action) {
    setBusy(id)
    try {
      await api(`/entity-delete-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      toast.success(action === 'approve' ? 'Delete request approved' : 'Delete request rejected')
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Delete Requests</div>
      {loading && <div className="text-sm text-zinc-500">Loading requests...</div>}
      {!loading && requests.length === 0 && <div className="text-sm text-zinc-600">No pending requests.</div>}
      <div className="space-y-3">
        {requests.map(r => (
          <div key={r.id} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-zinc-100 truncate">{r.entity_type} · {r.entity_id?.slice(0, 8)}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Requested by {r.requested_by_username} ({r.requested_by_role}) · {new Date(r.created_at).toLocaleString()}</div>
              {r.reason && <div className="text-xs text-zinc-400 mt-1">Reason: {r.reason}</div>}
            </div>
            {canReview && (
              <div className="flex items-center gap-2 shrink-0">
                <Btn size="sm" variant="danger" disabled={busy === r.id} onClick={() => resolve(r.id, 'approve')}>Approve</Btn>
                <Btn size="sm" variant="ghost" disabled={busy === r.id} onClick={() => resolve(r.id, 'reject')}>Reject</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

// ============== ADMIN PIPELINE APP (role='Admin') ==============
function AdminPipelineApp({ user, onLogout }) {
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
      <Topbar user={user} onLogout={onLogout} onEditProfile={onEditProfile} title="Pipeline" subtitle="Admin · Operations View" />
      <div className="px-4 md:px-8 py-6 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-zinc-400">Drag cards between stages. <span className="text-zinc-600">Refly cards are locked until resolved.</span></div>
          <Btn variant="ghost" size="sm" onClick={refresh} icon={RefreshCw}>Refresh</Btn>
        </div>
        <Kanban projects={projects} onMove={moveCard} onCardClick={setActive} role={user.role} />
      </div>
      <AnimatePresence>{active && <ProjectDrawer project={active} onClose={() => setActive(null)} role={user.role} onChanged={refresh} />}</AnimatePresence>
    </div>
  )
}

// ============== JOB CONSTANTS ==============
const JOB_STATUSES = ['Open', 'In Progress', 'Done', 'Blocked']
const JOB_STATUS_STYLES = {
  'Open':        { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30' },
  'In Progress': { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  'Done':        { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  'Blocked':     { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/40' },
}

// ============== WELCOME SCREEN ==============
function WelcomeScreen({ user }) {
  const { period } = useTimeOfDay(0)
  const meta = PERIOD_ACCENTS[period]
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <Backdrop />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center relative z-10 px-6"
      >
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-6 flex justify-center select-none">
          <span className="text-4xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent"
            style={{ textShadow: `0 0 40px rgba(99,102,241,0.2)` }}>
            Altiflow
          </span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}>
          <div className="text-4xl font-bold tracking-tight mb-2">Welcome back,</div>
          <div className="text-5xl font-bold mb-4" style={{ color: meta.primary }}>{user.username}</div>
          <div className="text-zinc-400 text-lg">{user.client?.name || 'Client Portal'}</div>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.5 }}
          className="mt-10 flex items-center justify-center gap-2 text-zinc-500 text-sm">
          <RefreshCw size={14} className="animate-spin" /> Loading your workspace…
        </motion.div>
      </motion.div>
    </div>
  )
}

// ============== CREATE PROJECT MODAL ==============
function CreateProjectModal({ user, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: '', type: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', head: user.username,
  })
  const [busy, setBusy] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.type || !form.start_date || !form.head) { toast.error('Project category and project admin are required'); return }
    setBusy(true)
    try {
      await api('/client-projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          name: form.name.trim() || `${form.type} - ${form.head}`,
          end_date: form.end_date || null,
        }),
      })
      toast.success('Project created!')
      onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg glass-strong rounded-t-3xl md:rounded-2xl border border-zinc-800/80 overflow-y-auto max-h-[90vh]"
      >
        <div className="px-6 py-5 border-b border-zinc-800/60 flex items-center justify-between">
          <div>
            <div className="font-semibold text-lg">New Project</div>
            <div className="text-xs text-zinc-500 mt-0.5">Create a workspace project for your team</div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Field label="Project Name (optional)">
            <TextInput value={form.name} onChange={v => set('name', v)} placeholder="e.g., North Region Survey Q3" />
          </Field>
          <Field label="Project Category *">
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
              <option value="">Select category…</option>
              <option value="Aerial Mapping">Aerial Mapping</option>
              <option value="Photogrammetry">Photogrammetry</option>
              <option value="LiDAR Survey">LiDAR Survey</option>
              <option value="Inspection">Inspection</option>
              <option value="3D Modelling">3D Modelling</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date *">
              <TextInput type="date" value={form.start_date} onChange={v => set('start_date', v)} />
            </Field>
            <Field label="End Date (optional)">
              <TextInput type="date" value={form.end_date} onChange={v => set('end_date', v)} />
            </Field>
          </div>
          <Field label="Project Admin *">
            <TextInput value={form.head} onChange={v => set('head', v)} placeholder="Project admin name" />
          </Field>
          <div className="flex gap-3 pt-2">
            <Btn type="button" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Btn>
            <Btn type="submit" disabled={busy || !form.type || !form.start_date || !form.head}
              className="flex-1" icon={Plus}>
              {busy ? 'Creating…' : 'Create Project'}
            </Btn>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function EditProjectInfoModal({ project, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: project?.name || '',
    type: project?.type || '',
    start_date: project?.start_date || '',
    end_date: project?.end_date || '',
    head: project?.head || '',
  })
  const [busy, setBusy] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.type || !form.start_date || !form.head) {
      toast.error('Project category and project admin are required')
      return
    }
    setBusy(true)
    try {
      const r = await api(`/client-projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          start_date: form.start_date,
          end_date: form.end_date || null,
          head: form.head.trim(),
        }),
      })
      toast.success('Project info updated')
      onDone?.(r.project)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg glass-strong rounded-t-3xl md:rounded-2xl border border-zinc-800/80 overflow-y-auto max-h-[90vh]"
      >
        <div className="px-6 py-5 border-b border-zinc-800/60 flex items-center justify-between">
          <div>
            <div className="font-semibold text-lg">Edit Project Info</div>
            <div className="text-xs text-zinc-500 mt-0.5">Update workspace details</div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Field label="Project Name (optional)">
            <TextInput value={form.name} onChange={v => set('name', v)} placeholder="e.g., North Region Survey Q3" />
          </Field>
          <Field label="Project Category *">
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
              <option value="">Select category…</option>
              <option value="Aerial Mapping">Aerial Mapping</option>
              <option value="Photogrammetry">Photogrammetry</option>
              <option value="LiDAR Survey">LiDAR Survey</option>
              <option value="Inspection">Inspection</option>
              <option value="3D Modelling">3D Modelling</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date *">
              <TextInput type="date" value={form.start_date} onChange={v => set('start_date', v)} />
            </Field>
            <Field label="End Date (optional)">
              <TextInput type="date" value={form.end_date} onChange={v => set('end_date', v)} />
            </Field>
          </div>
          <Field label="Project Admin *">
            <TextInput value={form.head} onChange={v => set('head', v)} placeholder="Project admin name" />
          </Field>
          <div className="flex gap-3 pt-2">
            <Btn type="button" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Btn>
            <Btn type="submit" disabled={busy || !form.type || !form.start_date || !form.head}
              className="flex-1" icon={Settings}>
              {busy ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ============== PROJECTS LIST PAGE ==============
function ProjectsListPage({ user, projects, isAdmin, onNavigate, onRefresh, onLogout, onEditProfile }) {
  const [showCreate, setShowCreate] = useState(false)

  async function deleteProject(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this workspace? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${id}`, { method: 'DELETE' })
      toast.success('Workspace moved to Bin')
      onRefresh?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="min-h-screen relative">
      <Backdrop />
      <Topbar user={user} onLogout={onLogout} onEditProfile={onEditProfile}
        title={user.client?.name || 'Client Portal'}
        subtitle="Workspace Overview" />
      <div className="px-4 md:px-8 py-8 relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {projects.length} project{projects.length !== 1 ? 's' : ''} · {user.client?.name}
            </p>
          </div>
          {isAdmin && <Btn onClick={() => setShowCreate(true)} icon={Plus}>New Project</Btn>}
        </div>

        {projects.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-24">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-4">
              <FolderOpen size={28} className="text-zinc-600" />
            </div>
            <div className="text-xl font-semibold text-zinc-300 mb-2">No projects yet</div>
            {isAdmin ? (
              <>
                <div className="text-zinc-500 text-sm mb-6">Create your first project to get started</div>
                <Btn onClick={() => setShowCreate(true)} icon={Plus}>Create Project</Btn>
              </>
            ) : (
              <div className="text-zinc-500 text-sm">No projects have been shared with your workspace yet</div>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            {projects.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }} onClick={() => onNavigate(p)} className="group cursor-pointer">
                <GlassCard className="p-5 hover:border-zinc-600 transition-all border border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Layers size={20} className="text-blue-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-100 truncate">{p.name}</div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-zinc-500 flex items-center gap-1"><Box size={10} />{p.type}</span>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="text-xs text-zinc-500 flex items-center gap-1"><User size={10} />{p.head}</span>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="text-xs text-zinc-500 flex items-center gap-1"><Calendar size={10} />{p.start_date}</span>
                          {p.end_date && <><span className="text-xs text-zinc-600">→</span>
                            <span className="text-xs text-zinc-500">{p.end_date}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isAdmin && (
                        <button onClick={e => deleteProject(e, p.id)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg" title="Delete workspace">
                          <Trash2 size={14} />
                        </button>
                      )}
                      <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateProjectModal user={user}
            onDone={() => { setShowCreate(false); onRefresh() }}
            onCancel={() => setShowCreate(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ============== PROJECT DASHBOARD TAB ==============
function ProjectDashboardTab({ project, jobs, teamMembers = [] }) {
  const total = jobs.length
  const standJobs    = jobs.filter(j => j.category === 'Stand Count')
  const uniJobs      = jobs.filter(j => j.category === 'Uniformity')
  const submitted    = total
  const scDone       = standJobs.filter(j => j.sc_status  === 'Done').length
  const scProgress   = standJobs.filter(j => j.sc_status  === 'In Progress').length
  const scBlocked    = standJobs.filter(j => j.sc_status  === 'Blocked').length
  const uniDone      = uniJobs.filter(j => j.uni_status === 'Done').length
  const uniProgress  = uniJobs.filter(j => j.uni_status === 'In Progress').length
  const uniBlocked   = uniJobs.filter(j => j.uni_status === 'Blocked').length
  const fullyDone    = jobs.filter(j =>
    (j.category === 'Stand Count' && j.sc_status === 'Done') ||
    (j.category === 'Uniformity' && j.uni_status === 'Done')).length
  const pending      = jobs.filter(j => {
    const key = j.category === 'Uniformity' ? j.uni_status : j.sc_status
    return !key || key === 'Pending'
  }).length
  const assignedJobs = jobs.filter(j => j.assigned_to).length
  const assignedTeam  = teamMembers.length
  const daysLeft    = project.end_date ? Math.ceil((new Date(project.end_date) - new Date()) / 86400000) : null

  // Recent activity: sort by updated_at desc, take top 5
  const recent = [...jobs]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 5)

  function activityLabel(job) {
    const key = job.category === 'Uniformity' ? job.uni_status : job.sc_status
    const category = job.category || 'Stand Count'
    if (key === 'Done') return { text: `${category} delivered`, color: 'text-emerald-400' }
    if (key === 'Blocked') return { text: `${category} blocked`, color: 'text-red-400' }
    if (key === 'In Progress') return { text: `${category} processing…`, color: 'text-blue-400' }
    return { text: `${category} submitted`, color: 'text-zinc-500' }
  }

  const categoryStats = [
    {
      label: 'Stand Count',
      total: standJobs.length,
      done: scDone,
      inProgress: scProgress,
      blocked: scBlocked,
      color: 'from-violet-500 to-blue-500',
      chip: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
    },
    {
      label: 'Uniformity',
      total: uniJobs.length,
      done: uniDone,
      inProgress: uniProgress,
      blocked: uniBlocked,
      color: 'from-amber-500 to-emerald-500',
      chip: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    },
  ]

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div className="space-y-6">
      {/* Deadline banner */}
      {daysLeft !== null && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium ${
          daysLeft < 0  ? 'bg-red-500/10 border-red-500/30 text-red-300' :
          daysLeft < 7  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                          'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
          <span className="flex items-center gap-2">
            <Calendar size={14} />
            {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days until deadline`}
          </span>
          <span className="text-xs opacity-70">{project.end_date}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {categoryStats.map(cat => {
          const totalCat = cat.total || 0
          const donePct = totalCat ? Math.round((cat.done / totalCat) * 100) : 0
          const progPct = totalCat ? Math.round((cat.inProgress / totalCat) * 100) : 0
          const blockPct = totalCat ? Math.round((cat.blocked / totalCat) * 100) : 0
          const pendPct = Math.max(0, 100 - donePct - progPct - blockPct)
          return (
            <GlassCard key={cat.label} className="p-5 border border-zinc-800/70">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className={`inline-flex items-center px-2 py-1 rounded-md border text-[10px] uppercase tracking-wider ${cat.chip}`}>{cat.label}</div>
                  <div className="text-2xl font-bold text-zinc-100 mt-2">{cat.total}</div>
                  <div className="text-[11px] text-zinc-500">submitted jobs</div>
                </div>
                <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center shadow-lg`}>
                  <span className="text-white font-bold text-sm">{donePct}%</span>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Completed</span><span className="text-zinc-300">{cat.done}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>In progress</span><span className="text-blue-300">{cat.inProgress}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Blocked</span><span className="text-red-300">{cat.blocked}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Pending</span><span className="text-zinc-400">{totalCat - cat.done - cat.inProgress - cat.blocked}</span>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full overflow-hidden bg-zinc-900 flex">
                <div className="bg-emerald-500" style={{ width: `${donePct}%` }} />
                <div className="bg-blue-500" style={{ width: `${progPct}%` }} />
                <div className="bg-red-500" style={{ width: `${blockPct}%` }} />
                <div className="bg-zinc-700" style={{ width: `${pendPct}%` }} />
              </div>
            </GlassCard>
          )
        })}
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-4 text-center">
          <div className="text-2xl font-bold text-blue-300">{pending}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1">Pending Jobs</div>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-4 text-center">
          <div className="text-2xl font-bold text-violet-300">{assignedJobs}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1">Assigned Jobs</div>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-300">{fullyDone}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1">Fully Delivered</div>
        </div>
      </div>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Project Team</div>
            <div className="text-sm text-zinc-300 mt-1">{assignedTeam} member{assignedTeam !== 1 ? 's' : ''} assigned to this project</div>
          </div>
          <div className="text-xs text-zinc-500">Client org members</div>
        </div>
        {teamMembers.length === 0 ? (
          <div className="text-sm text-zinc-600 py-3">No team members are assigned yet.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teamMembers.map(member => (
              <div key={member.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-zinc-700 flex items-center justify-center text-[11px] font-semibold text-zinc-200">
                  {(member.username || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-zinc-100 truncate">{member.username}</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Project member</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Recent activity feed */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={14} className="text-zinc-500" />
          <div className="text-xs uppercase tracking-wider text-zinc-500">Recent Activity</div>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-zinc-600 py-4 text-center">No field jobs yet.</div>
        ) : (
          <div className="space-y-0">
            {recent.map((job, i) => {
              const act = activityLabel(job)
              return (
                <div key={job.id}
                  className={`flex items-center justify-between py-3 ${i < recent.length - 1 ? 'border-b border-zinc-800/50' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      act.color.includes('emerald') ? 'bg-emerald-500' :
                      act.color.includes('amber')   ? 'bg-amber-500'   :
                      act.color.includes('violet')  ? 'bg-violet-500'  :
                      act.color.includes('blue')    ? 'bg-blue-500'    : 'bg-zinc-600'}`} />
                    <span className="text-sm text-zinc-200 truncate">{job.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={`text-xs font-medium ${act.color}`}>{act.text}</span>
                    <span className="text-[11px] text-zinc-600">{timeAgo(job.updated_at || job.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ============== JOB CARDS TAB ==============
function AddFieldJobForm({ project, orgUsers, onDone, onCancel, canAssignManual = false }) {
  const BLANK_FLIGHT = () => ({ image_count: null, csv_rows: null })
  const adminAssignees = orgUsers.filter(u => u.role === 'Admin')
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    title: '', capture_date: '', drone_name: '', category: 'Stand Count',
    flight_count: 1, flights: [BLANK_FLIGHT()],
    has_logs: false, comments: '', assigned_to: '',
  })
  const [busy, setBusy] = useState(false)

  function setFlightCount(n) {
    const count = Math.max(1, Math.min(10, n))
    setForm(f => ({
      ...f, flight_count: count,
      flights: Array.from({ length: count }, (_, i) => f.flights[i] || BLANK_FLIGHT()),
    }))
  }

  const IMAGE_EXTS = /\.(jpe?g|png)$/i
  function handleFolderSelect(e, idx) {
    const count = Array.from(e.target.files).filter(f => IMAGE_EXTS.test(f.name)).length
    setForm(f => {
      const flights = [...f.flights]
      flights[idx] = { ...flights[idx], image_count: count }
      return { ...f, flights }
    })
  }

  function handleCSVSelect(e, idx) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataRows = Math.max(0, ev.target.result.split('\n').filter(l => l.trim()).length - 1)
      setForm(f => {
        const flights = [...f.flights]
        flights[idx] = { ...flights[idx], csv_rows: dataRows }
        return { ...f, flights }
      })
    }
    reader.readAsText(file)
  }

  function setFlightMetric(idx, key, value) {
    setForm(f => {
      const flights = [...f.flights]
      const normalized = value === '' || value === null || value === undefined
        ? null
        : Math.max(0, Number(value) || 0)
      flights[idx] = { ...flights[idx], [key]: normalized }
      return { ...f, flights }
    })
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitted(true)
    const missingItems = []
    if (!form.title.trim()) missingItems.push('Field Name')
    if (!form.capture_date) missingItems.push('Date of Capture')
    if (!form.drone_name.trim()) missingItems.push('Drone Name')
    const missingFlights = form.flights
      .map((f, idx) => ({ idx, missing: f.image_count === null }))
      .filter(x => x.missing)
      .map(x => `Flight ${x.idx + 1} Image Count`)
    if (missingFlights.length > 0) missingItems.push(...missingFlights)

    if (missingItems.length > 0) {
      toast.error(`Missing required fields: ${missingItems.join(', ')}`)
      return
    }
    setBusy(true)
    try {
      await api(`/client-projects/${project.id}/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          capture_date: form.capture_date,
          drone_name: form.drone_name.trim(),
          category: form.category,
          flight_count: form.flight_count,
          flights: form.flights,
          has_logs: form.has_logs,
          comments: form.comments.trim() || null,
          assigned_to: canAssignManual ? (form.assigned_to || null) : null,
        }),
      })
      toast.success('Field job card submitted')
      onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const missing = {
    title: submitted && !form.title.trim(),
    capture: submitted && !form.capture_date,
    drone: submitted && !form.drone_name.trim(),
  }
  const valid = form.title.trim() && form.capture_date && form.drone_name.trim() && !form.flights.some(f => f.image_count === null)
  const fieldErrorCls = hasError => hasError ? 'border-red-500/70 focus:border-red-400' : ''

  return (
    <GlassCard className="p-4 rounded-2xl border border-zinc-800/70">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-zinc-200">New Field Job Card</div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500"><X size={14} /></button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {/* Row 1: Field Name + Capture Date + Category */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Field Name *">
            <TextInput className={fieldErrorCls(missing.title)} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g., Block A North" />
          </Field>
          <Field label="Date of Capture *">
            <input type="date" value={form.capture_date}
              onChange={e => setForm(f => ({ ...f, capture_date: e.target.value }))}
              className={`w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 [color-scheme:dark] ${fieldErrorCls(missing.capture)}`} />
          </Field>
          <Field label="Category *">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
              <option value="Stand Count">Stand Count</option>
              <option value="Uniformity">Uniformity</option>
            </select>
          </Field>
        </div>

        {/* Row 2: Drone Name + Flight Count */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Drone Name *">
            <TextInput className={fieldErrorCls(missing.drone)} value={form.drone_name} onChange={v => setForm(f => ({ ...f, drone_name: v }))} placeholder="e.g., DJI Mavic 3" />
          </Field>
          <Field label="No. of Flights">
            <div className="flex items-center gap-2 h-11">
              <button type="button" onClick={() => setFlightCount(form.flight_count - 1)}
                className="w-10 h-10 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center text-lg font-bold shrink-0">−</button>
              <div className="flex-1 h-10 bg-zinc-900/60 border border-zinc-800 rounded-lg flex items-center justify-center font-mono font-semibold text-zinc-100">
                {form.flight_count}
              </div>
              <button type="button" onClick={() => setFlightCount(form.flight_count + 1)}
                className="w-10 h-10 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center text-lg font-bold shrink-0">+</button>
            </div>
          </Field>
        </div>

        {/* Per-flight data */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Flight Data</div>
          {form.flights.map((flight, i) => {
            const missingFlight = submitted && (flight.image_count === null)
            return (
              <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-zinc-900/40 border transition ${
                missingFlight ? 'border-red-500/50 bg-red-500/5' : 'border-zinc-800/60'
              }`}>
                <div className="text-xs font-semibold text-zinc-400 min-w-[70px] flex items-center gap-1.5 shrink-0">
                  <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-300 font-mono">
                    {i + 1}
                  </span>
                  <span>Flight {i + 1}</span>
                </div>

                {/* Images Input + Folder Picker */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      value={flight.image_count ?? ''}
                      onChange={e => setFlightMetric(i, 'image_count', e.target.value)}
                      placeholder="Images (required)"
                      className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-9 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition ${
                        missingFlight ? 'border-red-500/50 focus:border-red-400' : ''
                      }`}
                    />
                    <label htmlFor={`img-${project.id}-${i}`} className="absolute right-2.5 p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" title="Select folder to auto-count images">
                      <Folder size={14} />
                    </label>
                    <input id={`img-${project.id}-${i}`} type="file" multiple className="sr-only"
                      ref={el => { if (el) { el.webkitdirectory = true } }}
                      onChange={e => handleFolderSelect(e, i)} />
                  </div>
                </div>

                {/* CSV Input + File Picker */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      value={flight.csv_rows ?? ''}
                      onChange={e => setFlightMetric(i, 'csv_rows', e.target.value)}
                      placeholder="CSV Rows (optional)"
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-9 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-700/40 transition"
                    />
                    <label htmlFor={`csv-${project.id}-${i}`} className="absolute right-2.5 p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" title="Select CSV to auto-count rows">
                      <FileText size={14} />
                    </label>
                    <input id={`csv-${project.id}-${i}`} type="file" accept=".csv,.CSV" className="sr-only"
                      onChange={e => handleCSVSelect(e, i)} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Logs checkbox */}
        <label className="flex items-center gap-3 cursor-pointer select-none group">
          <div onClick={() => setForm(f => ({ ...f, has_logs: !f.has_logs }))}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
              form.has_logs ? 'bg-emerald-500 border-emerald-500' : 'bg-zinc-900/60 border-zinc-700 group-hover:border-zinc-500'}`}>
            {form.has_logs && <CheckCircle2 size={12} className="text-white" />}
          </div>
          <span className="text-sm text-zinc-300">Logs Available</span>
        </label>

        {/* Comments */}
        <Field label="Comments">
          <textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} rows={2}
            placeholder="Any notes about this field capture…"
            className={`w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none ${fieldErrorCls(missing.comments)}`} />
        </Field>
        {submitted && !valid && <div className="text-xs text-red-300">Please fill all required fields before submitting.</div>}

        {/* Manual assignment for admins only. Client-created jobs are auto-assigned server-side. */}
        {canAssignManual && adminAssignees.length > 0 && (
          <Field label="Assign to Admin">
            <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
              <option value="">Unassigned</option>
              {adminAssignees.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </Field>
        )}

        <div className="flex gap-2 pt-1">
          <Btn type="button" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Btn>
          <Btn type="submit" disabled={busy} className="flex-1" icon={Upload}>
            {busy ? 'Submitting…' : 'Submit Job Card'}
          </Btn>
        </div>
      </form>
    </GlassCard>
  )
}

function ProjectTeamTab({ project, orgUsers, assignedUserIds, onCreateUser, onSaveAssignments }) {
  const [selectedIds, setSelectedIds] = useState(assignedUserIds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedIds(assignedUserIds)
  }, [assignedUserIds, project.id])

  const teamUsers = orgUsers.filter(u => u.role === 'Client-User')

  async function createUser({ username }) {
    const created = await onCreateUser(username)
    if (!created?.id) return
    setSelectedIds(prev => Array.from(new Set([...prev, created.id])))
  }

  async function saveAssignments() {
    setSaving(true)
    try {
      await onSaveAssignments(selectedIds)
      toast.success('Project team updated')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <ClientAdminUserCreate onSubmit={createUser} />

      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Assign to Project</div>
            <div className="text-sm text-zinc-300 mt-1">Pick teammates from your client org and save them to this project</div>
          </div>
          <Btn onClick={saveAssignments} disabled={saving} icon={Users}>Save Team</Btn>
        </div>

        {teamUsers.length === 0 ? (
          <div className="text-sm text-zinc-600 py-8 text-center">No client users in this organization yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {teamUsers.map(member => {
              const checked = selectedIds.includes(member.id)
              return (
                <label key={member.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-100 truncate">{member.username}</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">{member.client_name || member.role || 'Client User'}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...selectedIds, member.id]
                        : selectedIds.filter(id => id !== member.id)
                      setSelectedIds(next)
                    }}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0"
                  />
                </label>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ============== BULK UPLOAD CSV MODAL ==============
function BulkUploadJobsModal({ project, onDone, onCancel }) {
  const [rows, setRows] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)
  const fileRef = useRef(null)

  function downloadTemplate() {
    const headers = [
      'field_name', 'capture_date', 'drone_name', 'category', 'flight_count',
      'has_logs', 'comments',
      'flight_1_image_count', 'flight_1_csv_rows',
      'flight_2_image_count', 'flight_2_csv_rows',
      'flight_3_image_count', 'flight_3_csv_rows',
    ]
    const example1 = ['Block A North', '2025-07-15', 'DJI Mavic 3', 'Stand Count', '2', 'false', 'Clear weather morning flight', '1200', '350', '980', '310', '', '']
    const example2 = ['Field B East', '2025-07-16', 'DJI Phantom 4', 'Uniformity', '1', 'true', 'Overcast, stable conditions', '850', '', '', '', '', '']
    const csvContent = [headers.join(','), example1.join(','), example2.join(',')].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'altiflow_job_cards_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function parseCSVLine(line) {
    const result = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (c === ',' && !inQuotes) {
        result.push(field.trim())
        field = ''
      } else {
        field += c
      }
    }
    result.push(field.trim())
    return result
  }

  function validateRow(obj, lineNum) {
    const errors = []
    const fieldName = (obj['field_name'] || '').trim()
    const captureDate = (obj['capture_date'] || '').trim()
    const droneName = (obj['drone_name'] || '').trim()
    const categoryRaw = (obj['category'] || 'Stand Count').trim()
    const flightCountRaw = (obj['flight_count'] || '').trim()
    const hasLogs = (obj['has_logs'] || '').trim().toLowerCase() === 'true'
    const comments = (obj['comments'] || '').trim()

    if (!fieldName) errors.push('field_name is required')
    if (!captureDate || !/^\d{4}-\d{2}-\d{2}$/.test(captureDate)) errors.push('capture_date must be YYYY-MM-DD')
    if (!droneName) errors.push('drone_name is required')

    const VALID_CATS = ['Stand Count', 'Uniformity']
    const category = VALID_CATS.includes(categoryRaw) ? categoryRaw : 'Stand Count'
    if (!VALID_CATS.includes(categoryRaw)) errors.push('category must be "Stand Count" or "Uniformity"')

    const flightCount = parseInt(flightCountRaw, 10)
    if (isNaN(flightCount) || flightCount < 1 || flightCount > 10) errors.push('flight_count must be a number between 1 and 10')
    if (!comments) errors.push('comments is required')

    const flights = []
    const effectiveFlightCount = isNaN(flightCount) ? 1 : Math.min(Math.max(flightCount, 1), 10)
    for (let i = 1; i <= effectiveFlightCount; i++) {
      const imgRaw = (obj[`flight_${i}_image_count`] || '').trim()
      const csvRaw = (obj[`flight_${i}_csv_rows`] || '').trim()
      const imageCount = imgRaw !== '' ? parseInt(imgRaw, 10) : null
      if (imageCount === null || isNaN(imageCount) || imageCount < 0) {
        errors.push(`flight_${i}_image_count is required and must be a non-negative number`)
      }
      const csvRows = csvRaw !== '' ? parseInt(csvRaw, 10) : null
      flights.push({
        image_count: imageCount === null || isNaN(imageCount) ? null : imageCount,
        csv_rows: csvRows === null || isNaN(csvRows) ? null : csvRows,
      })
    }

    return {
      lineNum,
      fieldName,
      captureDate,
      droneName,
      category,
      flightCount: effectiveFlightCount,
      hasLogs,
      comments,
      flights,
      errors,
      valid: errors.length === 0,
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
      if (lines.length < 2) {
        toast.error('CSV must have a header row and at least one data row')
        return
      }
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
      const parsed = lines.slice(1).map((line, idx) => {
        const vals = parseCSVLine(line)
        const obj = {}
        headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim() })
        return validateRow(obj, idx + 2)
      })
      setRows(parsed)
      setResults(null)
    }
    reader.readAsText(file)
    // Reset input so same file can be re-selected after edit
    e.target.value = ''
  }

  async function submitAll() {
    const validRows = rows.filter(r => r.valid)
    if (!validRows.length) return
    setSubmitting(true)
    setProgress(0)
    const resultList = []
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i]
      try {
        await api(`/client-projects/${project.id}/jobs`, {
          method: 'POST',
          body: JSON.stringify({
            title: r.fieldName,
            capture_date: r.captureDate,
            drone_name: r.droneName,
            category: r.category,
            flight_count: r.flightCount,
            flights: r.flights,
            has_logs: r.hasLogs,
            comments: r.comments,
          }),
        })
        resultList.push({ lineNum: r.lineNum, fieldName: r.fieldName, ok: true })
      } catch (err) {
        resultList.push({ lineNum: r.lineNum, fieldName: r.fieldName, ok: false, error: err.message })
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }
    setResults(resultList)
    setSubmitting(false)
  }

  const validCount = rows.filter(r => r.valid).length
  const errorCount = rows.filter(r => !r.valid).length
  const successCount = results ? results.filter(r => r.ok).length : 0
  const failCount = results ? results.filter(r => !r.ok).length : 0

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <div className="font-semibold text-zinc-100 flex items-center gap-2">
              <Upload size={16} className="text-zinc-400" />
              Bulk Import Job Cards
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">Upload a CSV file to create multiple field job cards at once</div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Template download */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
            <div>
              <div className="text-sm font-medium text-zinc-200">Download Template</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Get the CSV template with all required columns and example data
              </div>
            </div>
            <Btn variant="outline" size="sm" icon={Download} onClick={downloadTemplate}>
              Template CSV
            </Btn>
          </div>

          {/* Column reference */}
          <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Required Columns</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400">
              <span><span className="text-zinc-200 font-mono">field_name</span> — Field / block name</span>
              <span><span className="text-zinc-200 font-mono">capture_date</span> — YYYY-MM-DD format</span>
              <span><span className="text-zinc-200 font-mono">drone_name</span> — Drone model used</span>
              <span><span className="text-zinc-200 font-mono">category</span> — Stand Count or Uniformity</span>
              <span><span className="text-zinc-200 font-mono">flight_count</span> — Number of flights (1–10)</span>
              <span><span className="text-zinc-200 font-mono">comments</span> — Capture notes</span>
              <span><span className="text-zinc-400 font-mono">has_logs</span> — true / false (optional)</span>
              <span><span className="text-zinc-200 font-mono">flight_N_image_count</span> — Per-flight image count</span>
            </div>
          </div>

          {/* File drop zone */}
          {!results && (
            <div>
              <label
                htmlFor="bulk-csv-file"
                className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-500 hover:bg-zinc-800/20 transition-colors"
              >
                <FileText size={32} className="text-zinc-500" />
                <div className="text-sm text-center">
                  <span className="font-medium text-zinc-200">Click to choose your CSV file</span>
                  <br />
                  <span className="text-xs text-zinc-500">Only .csv files are supported</span>
                </div>
                {rows.length > 0 && (
                  <div className="text-xs text-zinc-400 mt-1">
                    {rows.length} rows loaded — click to replace file
                  </div>
                )}
              </label>
              <input
                id="bulk-csv-file"
                ref={fileRef}
                type="file"
                accept=".csv,.CSV"
                className="sr-only"
                onChange={handleFile}
              />
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && !results && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-sm font-medium text-zinc-200">{rows.length} row{rows.length !== 1 ? 's' : ''} parsed</div>
                {validCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    {validCount} valid
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">
                    {errorCount} with errors
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-xs ${row.valid ? 'border-zinc-800/80 bg-zinc-900/40' : 'border-red-500/30 bg-red-500/5'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium ${row.valid ? 'text-zinc-200' : 'text-red-300'}`}>
                        Row {row.lineNum}: {row.fieldName || '(no field name)'}
                      </span>
                      {row.valid
                        ? <span className="text-emerald-400 flex items-center gap-1 shrink-0"><CheckCircle2 size={11} /> Valid</span>
                        : <span className="text-red-400 shrink-0">Invalid</span>}
                    </div>
                    {row.valid && (
                      <div className="mt-1 text-zinc-500">
                        {row.captureDate} · {row.droneName} · {row.category} · {row.flightCount} flight{row.flightCount !== 1 ? 's' : ''}
                        {row.hasLogs && ' · Logs available'}
                      </div>
                    )}
                    {!row.valid && (
                      <div className="mt-1 text-red-400">{row.errors.join(' · ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress bar */}
          {submitting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Submitting job cards…</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-zinc-200">Import Complete</div>
                {successCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    {successCount} created
                  </span>
                )}
                {failCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">
                    {failCount} failed
                  </span>
                )}
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2.5 rounded-lg text-xs border ${r.ok ? 'border-zinc-800 bg-zinc-900/30' : 'border-red-500/30 bg-red-500/5'}`}
                  >
                    {r.ok
                      ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                      : <AlertTriangle size={12} className="text-red-400 shrink-0" />}
                    <span className={`flex-1 ${r.ok ? 'text-zinc-300' : 'text-red-300'}`}>
                      Row {r.lineNum}: {r.fieldName}
                    </span>
                    {!r.ok && <span className="text-red-400 text-right">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 shrink-0 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            {!results && rows.length === 0 && 'Select a CSV file to get started'}
            {!results && validCount > 0 && `${validCount} job card${validCount !== 1 ? 's' : ''} ready to import`}
            {!results && rows.length > 0 && validCount === 0 && 'No valid rows — fix errors and re-upload'}
            {results && `${successCount} of ${results.length} job cards created successfully`}
          </div>
          <div className="flex gap-2 shrink-0">
            {results ? (
              <Btn onClick={() => { onDone(); onCancel() }}>Done</Btn>
            ) : (
              <>
                <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
                <Btn
                  disabled={validCount === 0 || submitting}
                  onClick={submitAll}
                  icon={Upload}
                >
                  {submitting ? 'Importing…' : `Import ${validCount > 0 ? validCount : ''} Job Card${validCount !== 1 ? 's' : ''}`}
                </Btn>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function JobCardsTab({ project, user, orgUsers, jobs, onRefresh, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [updating, setUpdating] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [commentDrafts, setCommentDrafts] = useState({})
  const [commentBusy, setCommentBusy] = useState(null)
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const adminAssignees = orgUsers.filter(u => u.role === 'Admin')

  async function updateStage(jobId, field, value) {
    setUpdating(jobId + field)
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
      onRefresh()
    } catch (e) { toast.error(e.message) } finally { setUpdating(null) }
  }

  async function deleteJob(jobId) {
    if (!confirm('Delete this field job card? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}`, { method: 'DELETE' })
      toast.success('Moved to Bin')
      onRefresh()
    } catch (e) { toast.error(e.message) }
  }

  async function requestDeleteJob(job) {
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'job', entity_id: job.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function addPipelineComment(jobId) {
    const text = (commentDrafts[jobId] || '').trim()
    if (!text) return
    setCommentBusy(jobId)
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: text, stage: 'General' }),
      })
      setCommentDrafts(prev => ({ ...prev, [jobId]: '' }))
      onRefresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCommentBusy(null)
    }
  }

  const stageCls = s =>
    `h-7 rounded-lg border px-2 text-[11px] font-medium bg-transparent focus:outline-none ${
      s === 'Done'        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
      s === 'In Progress' ? 'bg-blue-500/10    text-blue-300    border-blue-500/30'    :
      s === 'Cancelled'   ? 'bg-red-500/10     text-red-300     border-red-500/30'     :
      'bg-zinc-800/60 text-zinc-500 border-zinc-700'}`

  const ownerOptions = useMemo(() => {
    const vals = [...new Set((jobs || []).map(j => j.created_by_name).filter(Boolean))]
    return vals.sort((a, b) => a.localeCompare(b))
  }, [jobs])

  const assigneeOptions = useMemo(() => {
    const vals = [...new Set((jobs || []).map(j => j.assigned_to_name).filter(Boolean))]
    return vals.sort((a, b) => a.localeCompare(b))
  }, [jobs])

  function activeStage(job) {
    const stage = (job.category === 'Uniformity' ? job.uni_status : job.sc_status)
    if (stage) return toUiJobStage(stage)
    return toUiJobStage(job.status === 'Open' ? 'Pending' : job.status)
  }

  const filteredJobs = (jobs || []).filter(job => {
    const text = `${job.title || ''} ${job.drone_name || ''} ${job.created_by_name || ''} ${job.assigned_to_name || ''}`.toLowerCase()
    const q = search.trim().toLowerCase()
    if (q && !text.includes(q)) return false
    if (ownerFilter !== 'all' && (job.created_by_name || '') !== ownerFilter) return false
    if (assigneeFilter !== 'all') {
      const currentAssignee = job.assigned_to_name || 'Unassigned'
      if (currentAssignee !== assigneeFilter) return false
    }
    if (stageFilter !== 'all' && activeStage(job) !== stageFilter) return false
    return true
  })

  const groupedByDay = useMemo(() => {
    const groups = {}
    for (const job of filteredJobs) {
      const dateKey = new Date(job.created_at).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(job)
    }
    return Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).map(date => ({
      date,
      jobs: groups[date]
    }))
  }, [filteredJobs])

  const canDelete = ['Client-Admin', 'Super-Admin'].includes(user.role)
  const canRequestDelete = ['Admin', 'Client-User'].includes(user.role)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-zinc-400">{filteredJobs.length} of {jobs.length} field{jobs.length !== 1 ? 's' : ''}</div>
        {!showAdd && (
          <div className="flex items-center gap-2">
            <Btn variant="ghost" size="sm" icon={Upload} onClick={() => setShowBulkUpload(true)}>
              Bulk Import CSV
            </Btn>
            <Btn onClick={() => setShowAdd(true)} icon={Plus} variant="primary">Add Field</Btn>
          </div>
        )}
      </div>

      <GlassCard className="p-4">
        <div className="grid md:grid-cols-4 gap-2">
          <div className="md:col-span-2">
            <TextInput value={search} onChange={setSearch} placeholder="Search field name, owner, assignee, drone..." />
          </div>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
            <option value="all">All Owners</option>
            {ownerOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
            <option value="all">All Assignees</option>
            <option value="Unassigned">Unassigned</option>
            {assigneeOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {['all', 'Pending', 'In Progress', 'Done', 'Cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-2.5 h-7 text-[11px] rounded-lg border ${stageFilter === s ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
            >
              {s === 'all' ? 'All Stages' : s}
            </button>
          ))}
        </div>
      </GlassCard>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <AddFieldJobForm
              project={project}
              orgUsers={orgUsers}
              canAssignManual={isAdmin}
              onDone={() => { setShowAdd(false); onRefresh(project.id, { useCache: false }) }}
              onCancel={() => setShowAdd(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkUpload && (
          <BulkUploadJobsModal
            project={project}
            onDone={onRefresh}
            onCancel={() => setShowBulkUpload(false)}
          />
        )}
      </AnimatePresence>

      {filteredJobs.length === 0 && !showAdd && (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-3">
            <ClipboardList size={20} className="text-zinc-600" />
          </div>
          <div className="text-zinc-500 text-sm">No field job cards yet.</div>
        </div>
      )}

      <div className="space-y-6">
        {groupedByDay.map(group => (
          <div key={group.date} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 tracking-wide uppercase">{group.date}</span>
              <div className="h-[1px] bg-zinc-800/40 flex-1" />
              <span className="text-[10px] text-zinc-500 font-mono font-medium bg-zinc-900/60 border border-zinc-800/60 px-1.5 py-0.5 rounded">
                {group.jobs.length} card{group.jobs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
              <AnimatePresence>
                {group.jobs.map(job => {
                  const isOpen = expanded === job.id
                  const flights = Array.isArray(job.flights) ? job.flights : []
                  const totalImages = flights.reduce((s, f) => s + (f.image_count || 0), 0)
                  const totalCSV    = flights.reduce((s, f) => s + (f.csv_rows    || 0), 0)
                  return (
                    <motion.div key={job.id} className="w-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <GlassCard className="overflow-hidden w-full flex flex-col justify-between rounded-2xl border border-zinc-800/60 shadow-lg transition-all duration-200 hover:border-zinc-700/80">
                        {/* Card header — click to expand */}
                        <button type="button" onClick={() => setExpanded(isOpen ? null : job.id)}
                          className="w-full text-left p-5 hover:bg-white/[0.01] transition-colors">
                          <div className="flex flex-col gap-4 w-full">
                            {/* Top row: Category/Logs on left, Stage on right */}
                            <div className="w-full flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {job.category && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                                    job.category === 'Uniformity'
                                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                                      : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                                    {job.category}
                                  </span>
                                )}
                                {job.has_logs && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium">Logs</span>
                                )}
                              </div>
                              <span className={stageCls(activeStage(job))}>{activeStage(job)}</span>
                            </div>

                            {/* Middle section: Job title Only */}
                            <div className="py-1 w-full text-left">
                              <div className="font-bold text-base text-zinc-100 tracking-tight leading-snug truncate" title={job.title}>
                                {job.title}
                              </div>
                            </div>

                            {/* Symmetric Stats Bar */}
                            {flights.length > 0 && (
                              <div className="grid grid-cols-3 gap-1 py-2 bg-zinc-950/40 rounded-xl border border-zinc-800/40 w-full text-center">
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Flights</span>
                                  <span className="text-xs font-bold text-zinc-100 mt-0.5">{flights.length}</span>
                                </div>
                                <div className="flex flex-col items-center justify-center border-x border-zinc-800/40">
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 justify-center"><Camera size={9} /> Images</span>
                                  <span className="text-xs font-bold text-blue-400 mt-0.5">{totalImages.toLocaleString()}</span>
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 justify-center"><FileCheck size={9} /> CSV Rows</span>
                                  <span className="text-xs font-bold text-emerald-400 mt-0.5">{totalCSV.toLocaleString()}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Expanded detail panel */}
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="border-t border-zinc-800/60 px-4 py-4 space-y-4">
                                {/* Metadata details shown only after clicking */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-zinc-400 bg-zinc-900/30 rounded-xl p-3 border border-zinc-800/40">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Plane size={12} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500">Drone:</span>
                                    <span className="text-zinc-300 font-medium truncate" title={job.drone_name || 'No Drone'}>{job.drone_name || 'No Drone'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 min-w-0 justify-end">
                                    <Calendar size={12} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500">Captured:</span>
                                    <span className="text-zinc-300 font-medium">{job.capture_date ? new Date(job.capture_date + 'T00:00:00').toLocaleDateString() : 'No Date'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Clock size={12} className="text-zinc-500 shrink-0" />
                                    <span className="text-zinc-500">Uploaded:</span>
                                    <span className="text-zinc-300 font-medium">{new Date(job.created_at).toLocaleDateString()}</span>
                                  </div>
                                  {isAdmin && (
                                    <div className="flex items-center gap-2 min-w-0 justify-end">
                                      <User size={12} className="text-zinc-500 shrink-0" />
                                      <span className="text-zinc-500">Assigned:</span>
                                      <span className="text-zinc-300 font-medium truncate" title={job.assigned_to_name || 'Unassigned'}>{job.assigned_to_name || 'Unassigned'}</span>
                                    </div>
                                  )}
                                </div>
                                {/* Per-flight breakdown table */}
                                {flights.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Flight Breakdown</div>
                                    <div className="rounded-lg overflow-hidden border border-zinc-800/60">
                                      <div className="grid grid-cols-3 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">
                                        <span>Flight</span><span className="text-center">Images</span><span className="text-center">CSV Rows</span>
                                      </div>
                                      {flights.map((fl, i) => (
                                        <div key={i} className="grid grid-cols-3 px-3 py-2.5 border-t border-zinc-800/40 text-sm">
                                          <span className="text-zinc-400 text-xs">Flight {i + 1}</span>
                                          <span className={`text-center font-mono text-xs ${fl.image_count != null ? 'text-blue-300' : 'text-zinc-600'}`}>
                                            {fl.image_count != null ? fl.image_count.toLocaleString() : '—'}
                                          </span>
                                          <span className={`text-center font-mono text-xs ${fl.csv_rows != null ? 'text-emerald-300' : 'text-zinc-600'}`}>
                                            {fl.csv_rows != null ? fl.csv_rows.toLocaleString() : '—'}
                                          </span>
                                        </div>
                                      ))}
                                      {flights.length > 1 && (
                                        <div className="grid grid-cols-3 px-3 py-2.5 border-t border-zinc-700/60 bg-zinc-900/30 text-xs font-semibold">
                                          <span className="text-zinc-500">Total</span>
                                          <span className="text-center font-mono text-blue-300">{totalImages.toLocaleString()}</span>
                                          <span className="text-center font-mono text-emerald-300">{totalCSV.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Comments */}
                                {(job.comments || job.description) && (
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Comments</div>
                                    <div className="text-sm text-zinc-300 bg-zinc-900/40 rounded-lg px-3 py-2.5 border border-zinc-800/60 leading-relaxed">
                                      {job.comments || job.description}
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Pipeline Comment Timeline</div>
                                  <div className="space-y-2 max-h-44 overflow-auto pr-1">
                                    {(job.comments_log || []).length === 0 && (
                                      <div className="text-xs text-zinc-600">No stage updates yet.</div>
                                    )}
                                    {(job.comments_log || []).map(c => (
                                      <div key={c.id} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
                                        <div className="flex items-center justify-between gap-3 text-[10px] text-zinc-500">
                                          <span>{c.username || 'system'} · {c.stage || 'General'}</span>
                                          <span>{new Date(c.created_at).toLocaleString()}</span>
                                        </div>
                                        <div className="text-xs text-zinc-300 mt-1 whitespace-pre-wrap">{c.comment}</div>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="mt-2 flex gap-2">
                                    <textarea
                                      value={commentDrafts[job.id] || ''}
                                      onChange={e => setCommentDrafts(prev => ({ ...prev, [job.id]: e.target.value }))}
                                      rows={2}
                                      placeholder="Add stage update comment..."
                                      className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 resize-none"
                                    />
                                    <Btn
                                      size="sm"
                                      onClick={() => addPipelineComment(job.id)}
                                      disabled={commentBusy === job.id || !(commentDrafts[job.id] || '').trim()}
                                    >
                                      {commentBusy === job.id ? 'Saving...' : 'Add'}
                                    </Btn>
                                  </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-1 gap-3 flex-wrap">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span>Submitted by {job.created_by_name || 'unknown'}</span>
                                    {isAdmin && adminAssignees.length > 0 && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-zinc-500">Assigned to</span>
                                        <select
                                          value={job.assigned_to || ''}
                                          onChange={e => updateStage(job.id, 'assigned_to', e.target.value || null)}
                                          disabled={updating === job.id + 'assigned_to'}
                                          className="h-7 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
                                        >
                                          <option value="">Unassigned</option>
                                          {adminAssignees.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                  {canDelete && (
                                    <button onClick={() => deleteJob(job.id)}
                                      className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors">
                                      <Trash2 size={12} /> Delete
                                    </button>
                                  )}
                                  {canRequestDelete && (
                                    <button onClick={() => requestDeleteJob(job)}
                                      className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 transition-colors">
                                      <FileWarning size={12} /> Request Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </GlassCard>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============== PROJECT TRACKER TAB ==============
const STAGE_STYLES = {
  'Pending':     { bg: 'bg-zinc-800/60',      text: 'text-zinc-500',    border: 'border-zinc-700/60' },
  'In Progress': { bg: 'bg-blue-500/10',      text: 'text-blue-300',    border: 'border-blue-500/30' },
  'Done':        { bg: 'bg-emerald-500/10',   text: 'text-emerald-300', border: 'border-emerald-500/30' },
  'Blocked':     { bg: 'bg-red-500/10',       text: 'text-red-300',     border: 'border-red-500/40' },
  'Yet to Upload': { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
}

function StageChip({ status }) {
  const s = STAGE_STYLES[status] || STAGE_STYLES['Pending']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${s.bg} ${s.text} ${s.border} whitespace-nowrap`}>
      {status === 'Done' && <CheckCircle2 size={10} className="mr-1" />}
      {status === 'In Progress' && <Zap size={10} className="mr-1" />}
      {status === 'Blocked' && <AlertTriangle size={10} className="mr-1" />}
      {status === 'Yet to Upload' && <Upload size={10} className="mr-1" />}
      {status}
    </span>
  )
}

function ProjectTrackerTab({ project, jobs, canExport }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [sortColumn, setSortColumn] = useState('field_name')
  const [sortDirection, setSortDirection] = useState('asc')

  function fmtDate(value) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString()
  }

  function fmtDateTime(value) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString()
  }

  const rows = useMemo(() => {
    const list = []
    for (const j of (jobs || [])) {
      const cat = j.category || 'Stand Count'
      const rawStage = cat === 'Uniformity' ? (j.uni_status || 'Pending') : (j.sc_status || 'Pending')
      const stage = toUiJobStage(rawStage === 'Blocked' ? 'Cancelled' : rawStage)
      list.push({
        id: j.id,
        field_name: j.title || 'Untitled',
        category: cat,
        captured_date: fmtDate(j.capture_date),
        uploaded_date: fmtDateTime(j.created_at),
        uploaded_by: j.created_by_name || '-',
        assigned_to: j.assigned_to_name || 'Unassigned',
        stage: stage,
        delivery_date: stage === 'Done' ? fmtDate(j.updated_at || j.created_at) : '-',
      })
    }
    return list
  }, [jobs])

  const assigneeOptions = useMemo(() => {
    const vals = new Set()
    for (const r of rows) {
      if (r.assigned_to && r.assigned_to !== 'Unassigned' && r.assigned_to !== '-') {
        vals.add(r.assigned_to)
      }
    }
    return [...vals].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!r.field_name.toLowerCase().includes(q) && !r.assigned_to.toLowerCase().includes(q)) return false
      }
      if (categoryFilter !== 'all') {
        if (r.category !== categoryFilter) return false
      }
      if (stageFilter !== 'all') {
        if (r.stage !== stageFilter) return false
      }
      if (assigneeFilter !== 'all') {
        if (r.assigned_to !== assigneeFilter) return false
      }
      return true
    })
  }, [rows, search, categoryFilter, stageFilter, assigneeFilter])

  const sortedRows = useMemo(() => {
    const list = [...filteredRows]
    list.sort((a, b) => {
      let valA = a[sortColumn] || ''
      let valB = b[sortColumn] || ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredRows, sortColumn, sortDirection])

  function handleSort(col) {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  function SortIcon({ col }) {
    if (sortColumn !== col) return <span className="text-zinc-600 ml-1">↕</span>
    return sortDirection === 'asc' ? <span className="text-zinc-300 ml-1">▲</span> : <span className="text-zinc-300 ml-1">▼</span>
  }

  function trackerRows(items) {
    return items.map(r => [
      `"${(r.field_name || '').replace(/"/g, '""')}"`,
      `"${(r.category || '').replace(/"/g, '""')}"`,
      r.captured_date,
      r.uploaded_date,
      `"${(r.uploaded_by || '').replace(/"/g, '""')}"`,
      `"${(r.assigned_to || '').replace(/"/g, '""')}"`,
      r.stage,
      r.delivery_date,
    ])
  }

  function downloadCSV() {
    const headers = ['Field Name', 'Category', 'Captured Date', 'Uploaded Date', 'Uploaded By', 'Assigned To', 'Staged', 'Delivery Date']
    const csv = [headers.join(','), ...trackerRows(sortedRows).map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/\s+/g, '_')}_tracker_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  function downloadExcel() {
    const headers = ['Field Name', 'Category', 'Captured Date', 'Uploaded Date', 'Uploaded By', 'Assigned To', 'Staged', 'Delivery Date']
    const dataRows = trackerRows(sortedRows).map(r => r.map(v => String(v || '').replace(/^"|"$/g, '')))
    const table = `
      <table border="1">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${dataRows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    `
    const blob = new Blob([table], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/\s+/g, '_')}_tracker_${new Date().toISOString().slice(0,10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel downloaded')
  }

  function downloadPDF() {
    const headers = ['Field Name', 'Category', 'Captured Date', 'Uploaded Date', 'Uploaded By', 'Assigned To', 'Staged', 'Delivery Date']
    const html = `
      <html><head><title>${project.name} Tracker</title>
      <style>
        body{font-family:Arial,sans-serif;padding:16px}
        h2{margin:0 0 12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #999;padding:6px;text-align:left}
        th{background:#efefef}
      </style></head><body>
        <h2>${project.name} - Project Tracker</h2>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sortedRows.map(r => `<tr>
              <td>${r.field_name}</td>
              <td>${r.category}</td>
              <td>${r.captured_date}</td>
              <td>${r.uploaded_date}</td>
              <td>${r.uploaded_by}</td>
              <td>${r.assigned_to}</td>
              <td>${r.stage}</td>
              <td>${r.delivery_date}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `
    const w = window.open('', '_blank', 'width=1100,height=760')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
    toast.success('PDF print triggered')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-zinc-950/20 p-3 rounded-xl border border-zinc-800/40">
        {/* Filters */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search field name or assignee..."
              className="w-full h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg pl-3 pr-8 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300">
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="Stand Count">Stand Count</option>
            <option value="Uniformity">Uniformity</option>
          </select>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Stages</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Assignees</option>
            <option value="Unassigned">Unassigned</option>
            {assigneeOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Exports */}
        {canExport && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={downloadCSV}
              className="flex items-center gap-2 px-3 h-8 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors">
              <Download size={12} /> CSV
            </button>
            <button onClick={downloadExcel}
              className="flex items-center gap-2 px-3 h-8 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors">
              <FileText size={12} /> Excel
            </button>
            <button onClick={downloadPDF}
              className="flex items-center gap-2 px-3 h-8 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors">
              <FileCheck size={12} /> PDF
            </button>
          </div>
        )}
      </div>

      <GlassCard className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-zinc-500 text-sm">No tracker rows yet.</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-10 text-center text-zinc-500 text-sm">No matching tracker rows.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-zinc-950/80 border-b border-zinc-800/60 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('field_name')}>
                    Field Name <SortIcon col="field_name" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('category')}>
                    Category <SortIcon col="category" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('captured_date')}>
                    Captured Date <SortIcon col="captured_date" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('uploaded_date')}>
                    Uploaded Date <SortIcon col="uploaded_date" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('uploaded_by')}>
                    Uploaded By <SortIcon col="uploaded_by" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('assigned_to')}>
                    Assigned to <SortIcon col="assigned_to" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('stage')}>
                    Stage <SortIcon col="stage" />
                  </th>
                  <th className="text-left px-4 py-3 cursor-pointer select-none hover:text-zinc-300" onClick={() => handleSort('delivery_date')}>
                    Delivery Date <SortIcon col="delivery_date" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.id || i} className="border-t border-zinc-800/40 bg-zinc-950/50 hover:bg-white/[0.01] transition-colors">
                    <td className="px-4 py-3 text-zinc-200 font-medium">{r.field_name}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        r.category === 'Uniformity'
                          ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{r.captured_date}</td>
                    <td className="px-4 py-3 text-zinc-400">{r.uploaded_date}</td>
                    <td className="px-4 py-3 text-zinc-300">{r.uploaded_by}</td>
                    <td className="px-4 py-3 text-zinc-300">{r.assigned_to}</td>
                    <td className="px-4 py-3"><StageChip status={r.stage} /></td>
                    <td className="px-4 py-3 text-zinc-400">{r.delivery_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

function SupportTicketsTab({ user }) {
  const isInternal = ['Super-Admin', 'Admin'].includes(user.role)
  const isSuperAdmin = user.role === 'Super-Admin'
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: 'Medium' })

  async function loadTickets() {
    const cacheKey = `support-tickets:${user.role}:${user.id}:${user.client_id || 'none'}`
    const cached = getUiListCache(cacheKey)
    if (cached) {
      setTickets(cached)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const r = await api('/support-tickets?limit=80')
      const nextTickets = r.tickets || []
      setTickets(nextTickets)
      setUiListCache(cacheKey, nextTickets, 10000)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTickets() }, [])

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
      toast.success('Support ticket raised and sent to super admin queue')
      clearUiListCache('support-tickets:')
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
      toast.success('Ticket updated')
      clearUiListCache('support-tickets:')
      await loadTickets()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function deleteTicket(id) {
    if (!isSuperAdmin) return
    if (!confirm('Delete this support ticket? It can be restored from Bin.')) return
    try {
      await api(`/support-tickets/${id}`, { method: 'DELETE' })
      toast.success('Ticket moved to Bin')
      clearUiListCache('support-tickets:')
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
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Raise App Issue</div>
        <form onSubmit={submitTicket} className="space-y-3">
          <Field label="Issue Title *">
            <TextInput value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g., Upload page freezes after CSV selection" />
          </Field>
          <Field label="Severity">
            <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
              className="w-full h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600">
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
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-4">Support Queue</div>
        {loading ? (
          <div className="text-sm text-zinc-500">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-zinc-600">No support tickets raised yet.</div>
        ) : (
          <div className="space-y-3">
            {tickets.map(t => (
              <div key={t.id} className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-100">{t.title}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      Raised by {t.created_by_name || 'Unknown'}
                      {t.client_name && <span> · {t.client_name}</span>}
                      <span> · {new Date(t.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${sevCls(t.severity)}`}>{t.severity}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${statusCls(t.status)}`}>{t.status}</span>
                  </div>
                </div>
                <div className="text-sm text-zinc-300 whitespace-pre-wrap">{t.description}</div>
                {isInternal && (
                  <div className="pt-1 flex items-center justify-end gap-2">
                    <select value={t.status} onChange={e => updateTicket(t.id, e.target.value)}
                      className="h-8 bg-zinc-900/70 border border-zinc-800 rounded-lg px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600">
                      <option>Open</option>
                      <option>In Progress</option>
                      <option>Resolved</option>
                      <option>Closed</option>
                    </select>
                    {isSuperAdmin && (
                      <button onClick={() => deleteTicket(t.id)} className="h-8 px-2 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs">
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ============== ISSUE TRACKER TAB ==============
function IssueTrackerTab({ project, jobs, onRefresh }) {
  const issues = jobs.filter(j => j.status === 'Blocked')

  async function unblock(jobId) {
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ status: 'In Progress' }) })
      toast.success('Unblocked → In Progress')
      onRefresh()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
        issues.length > 0 ? 'bg-red-500/10 text-red-300 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`}>
        {issues.length > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
        {issues.length} blocked {issues.length === 1 ? 'issue' : 'issues'}
      </div>
      {issues.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
          <div className="text-zinc-300 font-medium">No blocked issues</div>
          <div className="text-zinc-600 text-sm mt-1">All jobs are flowing smoothly.</div>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {issues.map(job => (
            <motion.div key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <GlassCard className="p-4 border border-red-500/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle size={14} className="text-red-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-100">{job.title}</div>
                      {job.description && <div className="text-xs text-zinc-500 mt-1">{job.description}</div>}
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-600 flex-wrap">
                        {job.assigned_to_name && <span><User size={10} className="inline mr-1" />{job.assigned_to_name}</span>}
                        <span>{new Date(job.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => unblock(job.id)}>Unblock</Btn>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============== PROJECT DETAIL PAGE ==============
function ProjectDetailPage({
  project,
  user,
  orgUsers,
  onBack,
  onLogout,
  onRefresh,
  showDashboard = true,
  showBack = true,
  projects = [],
  onSwitchProject,
  showProjectSwitcher = false,
  onEditProfile,
}) {
  const [projectInfo, setProjectInfo] = useState(project)
  const [tab, setTab] = useState(showDashboard ? 'dashboard' : 'jobs')
  const [jobs, setJobs] = useState([])
  const [assignedUserIds, setAssignedUserIds] = useState([])
  const [showEditProject, setShowEditProject] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`altiflow_tab_${project.id}`)
      if (saved) setTab(saved)
    }
  }, [project.id])

  useEffect(() => {
    localStorage.setItem(`altiflow_tab_${projectInfo.id}`, tab)
  }, [tab, projectInfo.id])
  const [switchingProject, setSwitchingProject] = useState(false)
  const jobsCacheRef = useRef(new Map())
  const isAdmin = ['Client-Admin', 'Admin', 'Super-Admin'].includes(user.role)
  const canEditProjectInfo = ['Client-Admin', 'Admin', 'Super-Admin'].includes(user.role)
  const canDeleteWorkspace = ['Client-Admin', 'Super-Admin'].includes(user.role)
  const canRequestDeleteWorkspace = ['Admin', 'Client-User'].includes(user.role)
  const assignedUsers = orgUsers.filter(u => assignedUserIds.includes(u.id))

  useEffect(() => {
    setProjectInfo(project)
  }, [project])

  useEffect(() => {
    if (!showDashboard && tab === 'dashboard') setTab('jobs')
  }, [showDashboard, tab])

  async function loadJobs(projectId = project.id, { useCache = true } = {}) {
    if (useCache && jobsCacheRef.current.has(projectId)) {
      setJobs(jobsCacheRef.current.get(projectId) || [])
    }
    try {
      const r = await api(`/client-projects/${projectId}/jobs`)
      const list = r.jobs || []
      jobsCacheRef.current.set(projectId, list)
      setJobs(list)
    }
    catch (e) { toast.error(e.message) }
  }
  async function loadAssignments(projectId = project.id) {
    try {
      const r = await api(`/projects/${projectId}/assigned-users`)
      setAssignedUserIds(r.user_ids || [])
    } catch (e) { toast.error(e.message) }
  }
  async function saveAssignments(userIds) {
    try {
      await api(`/projects/${projectInfo.id}/assign-users`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds }),
      })
      toast.success('Team assignments saved')
      await loadAssignments(projectInfo.id)
      await onRefresh()
    } catch (e) {
      toast.error(e.message || 'Failed to save assignments')
    }
  }
  async function createTeamUser(username) {
    const r = await api('/users', {
      method: 'POST',
      body: JSON.stringify({ username, role: 'Client-User', client_id: projectInfo?.client_id }),
    })
    await onRefresh()
    return r.user
  }
  useEffect(() => {
    const nextId = project.id
    setSwitchingProject(true)
    loadJobs(nextId, { useCache: true }).finally(() => setSwitchingProject(false))
    if (isAdmin) loadAssignments(nextId)
    else setAssignedUserIds([])
  }, [project.id, isAdmin])
  useEffect(() => {
    if (!['jobs', 'issues', 'tracker'].includes(tab)) return
    const t = setInterval(() => {
      loadJobs(project.id, { useCache: false })
    }, 15000)
    return () => clearInterval(t)
  }, [project.id, tab])

  async function deleteWorkspace() {
    if (!canDeleteWorkspace) return
    if (!confirm('Delete this project workspace? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${project.id}`, { method: 'DELETE' })
      toast.success('Workspace moved to Bin')
      await onRefresh?.()
      onBack?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function requestWorkspaceDelete() {
    if (!canRequestDeleteWorkspace) return
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'client_project', entity_id: projectInfo.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function handleProjectInfoUpdated(nextProject) {
    if (nextProject) setProjectInfo(prev => ({ ...prev, ...nextProject }))
    setShowEditProject(false)
    await onRefresh?.()
  }

  const tabs = [
    ...(showDashboard ? [{ k: 'dashboard', l: 'Dashboard', i: BarChart3 }] : []),
    { k: 'jobs', l: 'Job Cards', i: ClipboardList },
    { k: 'tracker', l: 'Project Tracker', i: Activity },
    { k: 'issues', l: 'Issue Tracker', i: AlertTriangle },
    { k: 'support', l: 'Support Tickets', i: Bell },
    ...(user.role === 'Client-Admin' ? [{ k: 'delete-requests', l: 'Delete Requests', i: FileWarning }] : []),
    ...(isAdmin ? [{ k: 'team', l: 'Team', i: Users }] : []),
  ]

  return (
    <div className="min-h-screen relative pb-24">
      <Backdrop />
      <div className="sticky top-0 z-30 glass-strong border-b border-zinc-800/60">
        <div className="px-4 md:px-8 h-16 flex items-center gap-3">
          {showBack && (
            <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 shrink-0">
              <ChevronLeft size={18} />
            </button>
          )}
          {showProjectSwitcher && projects.length > 1 && (
            <div className="w-56 shrink-0">
              <select
                value={projectInfo.id}
                onChange={e => {
                  const nextId = e.target.value
                  if (nextId === projectInfo.id) return
                  onSwitchProject?.(nextId)
                }}
                className="w-full h-10 bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {switchingProject && <div className="text-[10px] text-zinc-500 mt-1">Switching project...</div>}
            </div>
          )}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center shrink-0">
              <Layers size={16} className="text-blue-300" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{projectInfo.name}</div>
              <div className="text-[11px] text-zinc-500 truncate">{projectInfo.type} · {projectInfo.head}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PeriodChip />
            {canEditProjectInfo && <Btn onClick={() => setShowEditProject(true)} variant="outline" size="sm" icon={Settings}>Edit Info</Btn>}
            {canDeleteWorkspace && <Btn onClick={deleteWorkspace} variant="danger" size="sm" icon={Trash2}>Delete Workspace</Btn>}
            {canRequestDeleteWorkspace && <Btn onClick={requestWorkspaceDelete} variant="ghost" size="sm" icon={FileWarning}>Request Delete</Btn>}
            {onLogout && <Btn onClick={onEditProfile} variant="ghost" size="sm" icon={User}>Profile</Btn>}
            {onLogout && <Btn onClick={onLogout} variant="ghost" size="sm" icon={LogOut}>Sign out</Btn>}
          </div>
        </div>
        <div className="flex gap-1 px-4 md:px-8 pb-3 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-3 h-9 text-sm rounded-lg flex items-center gap-2 whitespace-nowrap ${
                tab === t.k ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
              <t.i size={14} />{t.l}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 md:px-8 py-6 relative z-10">
        {tab === 'dashboard' && <ProjectDashboardTab project={projectInfo} jobs={jobs} teamMembers={assignedUsers} />}
        {tab === 'jobs' && <JobCardsTab project={projectInfo} user={user} orgUsers={orgUsers} jobs={jobs} onRefresh={loadJobs} isAdmin={isAdmin} />}
        {tab === 'tracker' && <ProjectTrackerTab project={projectInfo} jobs={jobs} canExport={true} />}
        {tab === 'issues' && <IssueTrackerTab project={projectInfo} jobs={jobs} onRefresh={loadJobs} />}
        {tab === 'support' && <SupportTicketsTab user={user} />}
        {tab === 'delete-requests' && <EntityDeleteRequestsTab user={user} />}
        {tab === 'team' && isAdmin && (
          <ProjectTeamTab
            project={projectInfo}
            orgUsers={orgUsers}
            assignedUserIds={assignedUserIds}
            onCreateUser={createTeamUser}
            onSaveAssignments={saveAssignments}
          />
        )}
      </div>

      <AnimatePresence>
        {showEditProject && (
          <EditProjectInfoModal
            project={projectInfo}
            onDone={handleProjectInfoUpdated}
            onCancel={() => setShowEditProject(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ============== CLIENT-ADMIN APP ==============
function ClientAdminApp({ user, onLogout, onEditProfile }) {
  const [screen, setScreen] = useState('projects')
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [orgUsers, setOrgUsers] = useState([])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedScreen = localStorage.getItem('altiflow_ca_screen')
      if (savedScreen) setScreen(savedScreen)
      const savedProj = localStorage.getItem('altiflow_ca_project')
      if (savedProj) setCurrentProject(JSON.parse(savedProj))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('altiflow_ca_screen', screen)
  }, [screen])

  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('altiflow_ca_project', JSON.stringify(currentProject))
    } else {
      localStorage.removeItem('altiflow_ca_project')
    }
  }, [currentProject])

  async function loadData() {
    try {
      const [pr, ur] = await Promise.all([api('/client-projects'), api('/users')])
      setProjects(pr.projects || [])
      setOrgUsers(ur.users || [])
    } catch (e) { toast.error(e.message) }
  }

  useEffect(() => { loadData() }, [])

  function openProject(p) { setCurrentProject(p); setScreen('project-detail') }
  function backToProjects() { setCurrentProject(null); setScreen('projects'); loadData() }

  if (screen === 'project-detail' && currentProject) {
    return (
      <>
        <ProjectDetailPage project={currentProject} user={user} orgUsers={orgUsers}
          onBack={backToProjects} onRefresh={loadData} onEditProfile={onEditProfile} />
        <PeriodSwitcher />
      </>
    )
  }
  return (
    <>
      <ProjectsListPage user={user} isAdmin projects={projects} orgUsers={orgUsers}
        onNavigate={openProject} onRefresh={loadData} onLogout={onLogout} onEditProfile={onEditProfile} />
      <PeriodSwitcher />
    </>
  )
}

function ClientAdminUserCreate({ onSubmit }) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    if (!username.trim()) return
    setBusy(true)
    try { await onSubmit({ username }) } finally { setBusy(false); setUsername('') }
  }
  return (
    <GlassCard className="p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Add team member</div>
      <div className="flex gap-2">
        <TextInput value={username} onChange={setUsername} placeholder="username" />
        <Btn onClick={create} disabled={busy || !username} icon={Plus}>Create</Btn>
      </div>
      <div className="text-[10px] text-zinc-600 mt-2">Default password: <span className="font-mono">WelcometoAlti@123</span></div>
    </GlassCard>
  )
}

// ============== CLIENT APP (Client-User) ==============
function ClientApp({ user, onLogout, onEditProfile }) {
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [screen, setScreen] = useState('waiting')
  const [loadingProject, setLoadingProject] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedScreen = localStorage.getItem('altiflow_cu_screen')
      if (savedScreen) setScreen(savedScreen)
      const savedProj = localStorage.getItem('altiflow_cu_project')
      if (savedProj) setCurrentProject(JSON.parse(savedProj))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('altiflow_cu_screen', screen)
  }, [screen])

  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('altiflow_cu_project', JSON.stringify(currentProject))
    } else {
      localStorage.removeItem('altiflow_cu_project')
    }
  }, [currentProject])

  async function loadData() {
    setLoadingProject(true)
    try {
      const r = await api('/client-projects')
      const projects = r.projects || []
      setProjects(projects)
      if (projects.length > 0) {
        setCurrentProject(prev => {
          if (prev && projects.some(p => p.id === prev.id)) return projects.find(p => p.id === prev.id) || projects[0]
          return projects[0]
        })
        setScreen('project-detail')
      } else {
        setCurrentProject(null)
        setScreen('waiting')
      }
    } catch (e) {
      toast.error(e.message)
      setScreen('waiting')
    } finally {
      setLoadingProject(false)
    }
  }

  useEffect(() => { loadData() }, [])
  if (screen === 'waiting') {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center relative px-4">
          <Backdrop />
          <GlassCard className="relative z-10 p-8 max-w-md text-center">
            <div className="text-xl font-semibold text-zinc-100 mb-2">Workspace not assigned yet</div>
            <div className="text-sm text-zinc-500">Your project will appear here once it is assigned.</div>
            {loadingProject && <div className="text-xs text-zinc-600 mt-3">Checking for updates…</div>}
            <div className="mt-5 flex justify-center">
              <Btn onClick={onLogout} variant="ghost" size="sm" icon={LogOut}>Sign out</Btn>
            </div>
          </GlassCard>
        </div>
        <PeriodSwitcher />
      </>
    )
  }
  if (screen === 'project-detail' && currentProject) {
    return (
      <>
        <ProjectDetailPage project={currentProject} user={user} orgUsers={[]}
          onBack={() => {}}
          onLogout={onLogout}
          onRefresh={loadData}
          showDashboard={false}
          showBack={false}
          showProjectSwitcher={true}
          projects={projects}
          onSwitchProject={projectId => {
            const next = projects.find(p => p.id === projectId)
            if (next) setCurrentProject(next)
          }}
          onEditProfile={onEditProfile} />
        <PeriodSwitcher />
      </>
    )
  }
  return <><PeriodSwitcher /></>
}

// ============== EDIT PROFILE MODAL ==============
function EditProfileModal({ user, onRefresh, onClose }) {
  const [username, setUsername] = useState(user?.username || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!username.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await api('/auth/change-username', {
        method: 'POST',
        body: JSON.stringify({ new_username: username.trim() }),
      })
      toast.success('Username updated successfully')
      onRefresh()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <GlassCard className="w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500"><X size={14} /></button>
        <div className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <User size={16} className="text-blue-400" /> Edit Profile
        </div>
        <div className="space-y-4">
          <Field label="Username (User ID)" hint="Must be at least 3 characters. Alphanumeric and underscores only.">
            <TextInput value={username} onChange={setUsername} placeholder="e.g. shalini" />
          </Field>
          {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg">{error}</div>}
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose} className="flex-1">Cancel</Btn>
            <Btn onClick={save} disabled={busy || !username.trim() || username.trim() === user.username} className="flex-1">
              {busy ? 'Saving...' : 'Save'}
            </Btn>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

// ============== ROOT ==============
function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showProfile, setShowProfile] = useState(false)

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

  function logout() {
    clearToken()
    setUser(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('altiflow_ca_screen')
      localStorage.removeItem('altiflow_ca_project')
      localStorage.removeItem('altiflow_cu_screen')
      localStorage.removeItem('altiflow_cu_project')
      localStorage.removeItem('altiflow_admin_active_proj')
      localStorage.removeItem('altiflow_admin_active_client_proj')
      localStorage.removeItem('altiflow_admin_tab')
    }
    toast.success('Signed out')
  }

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

  let appContent = <div>Unknown role</div>
  if (user.role === 'Super-Admin' || user.role === 'Admin') {
    appContent = <AdminApp user={user} onLogout={logout} onEditProfile={() => setShowProfile(true)} />
  } else if (user.role === 'Client-Admin') {
    appContent = <ClientAdminApp user={user} onLogout={logout} onEditProfile={() => setShowProfile(true)} />
  } else if (user.role === 'Client-User') {
    appContent = <ClientApp user={user} onLogout={logout} onEditProfile={() => setShowProfile(true)} />
  }

  return (
    <>
      {appContent}
      {showProfile && <EditProfileModal user={user} onRefresh={loadMe} onClose={() => setShowProfile(false)} />}
      <PeriodSwitcher />
    </>
  )
}

export default App
