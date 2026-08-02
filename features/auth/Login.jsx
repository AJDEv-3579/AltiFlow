import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, Lock, Mail, Eye, EyeOff } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import Btn from '@/components/ui/Btn'
import TimeBackdrop from '@/components/TimeBackdrop'
import { authService } from '@/services/authService'
import { api } from '@/services/api'
import { readUploadedFile } from '@/utils/formatters'

export function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotTab, setForgotTab] = useState('email')
  const [showPwd, setShowPwd] = useState(false)
  const [passkeyFile, setPasskeyFile] = useState(null)
  const [passkeyFileContent, setPasskeyFileContent] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(null)
  const [emailSent, setEmailSent] = useState(false)
  const [recoveryUser, setRecoveryUser] = useState(null)

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setSetup).catch(() => {})

    if (typeof window !== 'undefined') {
      try {
        const rawSearch = window.location.search ? window.location.search.replace(/^\?/, '') : ''
        const rawHash = window.location.hash ? window.location.hash.replace(/^#/, '') : ''
        const combined = [rawSearch, rawHash].filter(Boolean).join('&')
        const params = new URLSearchParams(combined)
        const type = params.get('type')
        const accessToken = params.get('access_token') || params.get('token') || params.get('code') || params.get('token_hash')
        const errorCode = params.get('error_code') || params.get('error')

        if (errorCode) {
          toast.error(params.get('error_description') || 'Password reset link expired or invalid.')
          return
        }

        if (accessToken || type === 'recovery' || type === 'invite') {
          let userId = 'recovery_user'
          let email = ''
          if (accessToken && accessToken.includes('.')) {
            try {
              const base64Url = accessToken.split('.')[1]
              if (base64Url) {
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
                const jsonPayload = decodeURIComponent(
                  atob(base64)
                    .split('')
                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
                )
                const payload = JSON.parse(jsonPayload)
                if (payload?.sub) userId = payload.sub
                if (payload?.email) email = payload.email
              }
            } catch (jwtErr) {
              console.warn('JWT payload decode warning:', jwtErr)
            }
          }
          setRecoveryUser({ id: userId, email: email, token: accessToken })
        }
      } catch (e) {
        console.warn('Recovery token parse error:', e)
      }
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const user = await authService.login(username, password)
      toast.success(`Welcome back, ${user.username}`)
      if (typeof onLogin === 'function') {
        onLogin(user)
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitForgotEmail(e) {
    e.preventDefault()
    if (!username.trim()) {
      toast.error('Username or email address is required')
      return
    }
    setBusy(true)
    try {
      const res = await api('/auth/request-reset-email', {
        method: 'POST',
        body: JSON.stringify({ identifier: username }),
      })
      toast.success(res.message || 'Password reset link sent!')
      setEmailSent(true)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitForgotPasskey(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
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
      setConfirmPassword('')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitCompleteReset(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setBusy(true)
    try {
      await api('/auth/complete-password-reset', {
        method: 'POST',
        body: JSON.stringify({
          user_id: recoveryUser?.id,
          email: recoveryUser?.email,
          identifier: recoveryUser?.email || recoveryUser?.id,
          new_password: newPassword,
        }),
      })
      toast.success('Password updated successfully! Sign in with your new password.')
      setRecoveryUser(null)
      setNewPassword('')
      setConfirmPassword('')
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const showSetup = setup && setup.tables_ready === false
  const projectRef = setup?.supabase_url ? setup.supabase_url.match(/https?:\/\/([^.]+)/)?.[1] : null
  const sqlEditorUrl = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard'

  const passkeyPasswordsMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword)
  const passkeyPasswordsMismatch = Boolean(newPassword && confirmPassword && newPassword !== confirmPassword)
  const recoveryPasswordsMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword)
  const recoveryPasswordsMismatch = Boolean(newPassword && confirmPassword && newPassword !== confirmPassword)

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <TimeBackdrop />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="mb-2">
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-300 via-blue-300 to-emerald-300 bg-clip-text text-transparent select-none drop-shadow-sm">
              AltiFlow
            </h1>
          </motion.div>
          <div className="text-base sm:text-lg font-semibold text-zinc-200 max-w-md leading-snug">
            UAV Project Management & Operations, Simplified.
          </div>
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
              <li>Open <a href={sqlEditorUrl} target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">Supabase SQL Editor →</a></li>
              <li>Copy the contents of <code className="px-1 py-0.5 bg-zinc-800 rounded text-amber-200">supabase/schema.sql</code></li>
              <li>Paste → Run. Refresh this page.</li>
            </ol>
            <a href={sqlEditorUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 text-xs font-medium hover:bg-amber-400 transition">
              Open SQL Editor <ArrowRight size={12} />
            </a>
          </motion.div>
        )}

        <GlassCard className="p-8">
          {recoveryUser ? (
            <div>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto mb-3">
                  <Lock className="text-violet-400" size={22} />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Set New Password</h2>
                <p className="text-xs text-zinc-400">Password recovery authenticated for your account</p>
              </div>
              <form onSubmit={submitCompleteReset} className="space-y-4">
                <Field label="New Password" hint="At least 6 characters.">
                  <TextInput value={newPassword} onChange={setNewPassword} type="password" placeholder="••••••••" />
                </Field>
                <Field label="Confirm Password">
                  <TextInput value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" />
                </Field>
                {recoveryPasswordsMismatch && (
                  <div className="text-xs text-red-400 font-medium">✕ Passwords do not match</div>
                )}
                {recoveryPasswordsMatch && (
                  <div className="text-xs text-emerald-400 font-medium">✓ Passwords match</div>
                )}
                <Btn type="submit" disabled={busy || newPassword.length < 6 || newPassword !== confirmPassword} className="w-full mt-2">
                  {busy ? 'Saving Password…' : 'Save New Password & Sign In'}
                  <ArrowRight size={16} />
                </Btn>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              {forgotMode && (
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900/80 rounded-lg border border-zinc-800 text-xs font-medium mb-4">
                  <button
                    type="button"
                    onClick={() => { setForgotTab('email'); setEmailSent(false) }}
                    className={`py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${forgotTab === 'email' ? 'bg-zinc-800 text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <Mail size={13} /> Send Email Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotTab('passkey')}
                    className={`py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${forgotTab === 'passkey' ? 'bg-zinc-800 text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <Lock size={13} /> Passkey File
                  </button>
                </div>
              )}

              {!forgotMode ? (
                <form onSubmit={submit} className="space-y-4">
                  <Field label="Username or Email Address">
                    <TextInput value={username} onChange={setUsername} placeholder="username or email" />
                  </Field>
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
                </form>
              ) : forgotTab === 'email' ? (
                <form onSubmit={submitForgotEmail} className="space-y-4">
                  <Field label="Username or Email Address" hint="Enter your username or email address to receive a password reset link.">
                    <TextInput value={username} onChange={setUsername} placeholder="username or email" />
                  </Field>
                  {emailSent ? (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                      ✓ Password reset link has been dispatched to your email. Check your inbox to reset your password.
                    </div>
                  ) : (
                    <Btn type="submit" disabled={busy || !username.trim()} className="w-full mt-2">
                      {busy ? 'Sending Link…' : 'Send Reset Email'}
                      <ArrowRight size={16} />
                    </Btn>
                  )}
                </form>
              ) : (
                <form onSubmit={submitForgotPasskey} className="space-y-4">
                  <Field label="Username or Email Address">
                    <TextInput value={username} onChange={setUsername} placeholder="username or email" />
                  </Field>
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
                  <Field label="Confirm Password">
                    <TextInput value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" />
                  </Field>
                  {passkeyPasswordsMismatch && (
                    <div className="text-xs text-red-400 font-medium">✕ Passwords do not match</div>
                  )}
                  {passkeyPasswordsMatch && (
                    <div className="text-xs text-emerald-400 font-medium">✓ Passwords match</div>
                  )}
                  <Btn type="submit" disabled={busy || !username || !passkeyFileContent || newPassword.length < 6 || newPassword !== confirmPassword} className="w-full mt-2">
                    {busy ? 'Resetting…' : 'Reset Password'}
                    <ArrowRight size={16} />
                  </Btn>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setForgotMode(v => !v)
                  setPasskeyFile(null)
                  setPasskeyFileContent('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setEmailSent(false)
                }}
                className="w-full text-xs text-zinc-400 hover:text-zinc-200 transition-colors pt-2 cursor-pointer"
              >
                {forgotMode ? 'Back to sign in' : 'Forgot password? Reset via Email or Passkey'}
              </button>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  )
}

export default Login
