import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { UserPlus, X, AlertCircle, Building2 } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function CreateUserModal({ isOpen, onClose, clients = [], onRefresh, existingUsers = [], user = null }) {
  const isClientAdminCreator = user?.role === 'Client-Admin'
  const allowedRoles = isClientAdminCreator ? ['Client-User', 'Client-Admin'] : ['Super-Admin', 'Admin', 'Client-Admin', 'Client-User']

  const [role, setRole] = useState(isClientAdminCreator ? 'Client-User' : 'Admin')
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [clientId, setClientId] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [usernameStatus, setUsernameStatus] = useState(null)

  const isOwnerRole = ['Super-Admin', 'Admin'].includes(role)
  const isClientRole = ['Client-Admin', 'Client-User'].includes(role)
  const isEmailRequired = isClientRole

  useEffect(() => {
    if (isOpen) {
      setRole(isClientAdminCreator ? 'Client-User' : 'Admin')
      setUsername('')
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setClientId(isClientAdminCreator ? (user?.client_id || user?.client?.id || '') : '')
      setErrorMsg('')
      setUsernameStatus(null)
    }
  }, [isOpen, isClientAdminCreator, user])

  useEffect(() => {
    const trimmed = username.trim()
    if (!trimmed) {
      setUsernameStatus(null)
      return
    }
    if (trimmed.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      setUsernameStatus('invalid')
      return
    }

    const isLocalDuplicate = existingUsers.some(
      u => u.username && u.username.toLowerCase() === trimmed.toLowerCase()
    )
    if (isLocalDuplicate) {
      setUsernameStatus('taken')
      return
    }

    setUsernameStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const res = await api(`/users/check-username?username=${encodeURIComponent(trimmed)}`)
        if (res.available) {
          setUsernameStatus('available')
        } else {
          setUsernameStatus('taken')
        }
      } catch {
        setUsernameStatus('available')
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [username, existingUsers])

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    const trimmedUser = username.trim()
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const trimmedEmail = email.trim()

    if (!trimmedFirst) {
      setErrorMsg('First Name is required.')
      return
    }
    if (!trimmedLast) {
      setErrorMsg('Last Name is required.')
      return
    }
    if (!trimmedUser || usernameStatus === 'invalid') {
      setErrorMsg('Please enter a valid username (min 3 characters, alphanumeric/underscores/dots).')
      return
    }
    if (usernameStatus === 'taken') {
      setErrorMsg(`Username '${trimmedUser}' is already taken. Please choose another username.`)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (isEmailRequired) {
      if (!trimmedEmail) {
        setErrorMsg('Email Address is required for Client roles (Client-Admin, Client-User).')
        return
      }
      if (!emailRegex.test(trimmedEmail)) {
        setErrorMsg('Please enter a valid email address.')
        return
      }
    } else if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.')
      return
    }

    const effectiveClientId = isClientAdminCreator ? (user?.client_id || user?.client?.id || clientId) : clientId
    if (isClientRole && !effectiveClientId) {
      setErrorMsg('Please select a Client Organization for this user.')
      return
    }

    setBusy(true)
    try {
      const payload = {
        username: trimmedUser,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        email: trimmedEmail || null,
        phone: phone.trim() || null,
        role: isClientAdminCreator && !allowedRoles.includes(role) ? 'Client-User' : role,
        client_id: isClientRole ? effectiveClientId : null,
      }
      const r = await api('/users', { method: 'POST', body: JSON.stringify(payload) })
      toast.success(`User '${r.user.username}' created successfully! Default password: ${r.default_password}`, { duration: 7000 })
      onClose()
      onRefresh?.()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Create New User
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                  isOwnerRole
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}>
                  {isOwnerRole ? 'Owner Category' : 'Client Category'}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                {isOwnerRole
                  ? 'Owner Account (Username login · Email optional)'
                  : 'Client Account (Email mandatory for Supabase Auth & Invitations)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Select Role <span className="text-red-400">*</span>
            </label>
            <div className={`grid gap-2 ${isClientAdminCreator ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {allowedRoles.map(r => {
                const isSelected = role === r
                const isOwner = ['Super-Admin', 'Admin'].includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-violet-500/15 border-violet-500/50 text-violet-200 font-semibold ring-1 ring-violet-500/50'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-semibold">{r}</span>
                    <span className="text-[9px] text-zinc-500 mt-1">
                      {isOwner ? 'Owner' : 'Client'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {isClientRole && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Client Organization <span className="text-red-400">*</span>
              </label>
              {isClientAdminCreator ? (
                <div className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 flex items-center text-xs text-zinc-200 font-medium">
                  <Building2 size={14} className="text-zinc-500 mr-2 shrink-0" />
                  <span className="truncate">{user?.client_name || user?.client?.name || clients.find(c => c.id === (user?.client_id || clientId))?.name || 'Your Client Organization'}</span>
                  <span className="ml-auto text-[9px] text-zinc-500 uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 shrink-0">Locked to your org</span>
                </div>
              ) : (
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 focus:outline-none focus:border-violet-500/50 cursor-pointer"
                >
                  <option value="">Select client organization…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                First Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="e.g. John"
                className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Last Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="e.g. Doe"
                className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Username <span className="text-red-400">*</span>
              </label>
              {usernameStatus === 'checking' && (
                <span className="text-[10px] text-amber-400 animate-pulse">Checking availability…</span>
              )}
              {usernameStatus === 'available' && (
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  ✓ Available
                </span>
              )}
              {usernameStatus === 'taken' && (
                <span className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
                  ✕ Username already taken
                </span>
              )}
              {usernameStatus === 'invalid' && (
                <span className="text-[10px] text-red-400">Min 3 chars (letters, numbers, _, -)</span>
              )}
            </div>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().trim())}
              placeholder="e.g. jdoe_admin"
              className={`w-full h-10 bg-zinc-900/60 border rounded-xl px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none ${
                usernameStatus === 'taken' || usernameStatus === 'invalid'
                  ? 'border-red-500/60 focus:border-red-500'
                  : usernameStatus === 'available'
                  ? 'border-emerald-500/60 focus:border-emerald-500'
                  : 'border-zinc-800 focus:border-violet-500/50'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Email Address {isEmailRequired ? <span className="text-red-400">*</span> : <span className="text-zinc-500 font-normal lowercase">(optional)</span>}
              </label>
              <span className="text-[10px] text-zinc-500">
                {isEmailRequired ? 'Mandatory for Client users' : 'Optional for Owner users'}
              </span>
            </div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={isEmailRequired ? "user@clientcompany.com" : "owner@company.com (optional)"}
              className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Phone Number <span className="text-zinc-500 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full h-10 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div className="pt-1 text-[11px] text-zinc-400 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60 leading-relaxed">
            🔑 <strong className="text-zinc-200">Default Password:</strong> <code className="text-violet-300 bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-[10px]">WelcometoAlti@123</code>. User will be prompted to reset password on first login.
          </div>
        </form>

        <div className="px-6 py-4 border-t border-zinc-800 shrink-0 flex items-center justify-end gap-2 bg-zinc-900/40">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            size="sm"
            onClick={handleSubmit}
            disabled={busy || usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'}
            icon={UserPlus}
          >
            {busy ? 'Creating User…' : 'Create User'}
          </Btn>
        </div>
      </motion.div>
    </div>
  )
}

export default CreateUserModal
