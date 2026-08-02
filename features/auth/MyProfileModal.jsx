import React, { useState } from 'react'
import { User, Phone, Mail, Shield, Building2, Layers, X, Lock, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import GlassCard from '@/components/ui/GlassCard'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import Btn from '@/components/ui/Btn'
import { authService } from '@/services/authService'

export function MyProfileModal({ user, onRefresh, onClose, backdropEnabled = true, onBackdropChange }) {
  const [fullName, setFullName] = useState(user?.full_name || (user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : ''))
  const [phone, setPhone] = useState(user?.phone || '')
  const [usernameInput, setUsernameInput] = useState(user?.username || '')
  const [busy, setBusy] = useState(false)
  const [backdropPreference, setBackdropPreference] = useState(Boolean(backdropEnabled))

  const username = user?.username || '—'
  const email = user?.email || `${username}@altiflow.io`
  const role = user?.role || '—'
  const company = user?.client?.name || user?.company_name || 'AltiFlow Enterprise'
  const workspace = user?.workspace_id || user?.client_id || 'Global Workspace'

  async function handleSave(e) {
    e.preventDefault()
    const trimmedUsername = String(usernameInput || '').trim()
    if (!trimmedUsername) {
      toast.error('Username is required')
      return
    }
    if (trimmedUsername.length < 3) {
      toast.error('Username must be at least 3 characters')
      return
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      toast.error('Username can only contain letters, numbers, underscores, dots, and hyphens')
      return
    }

    setBusy(true)
    try {
      if (trimmedUsername !== username) {
        await authService.changeUsername(trimmedUsername)
      }
      await authService.updateProfile({ full_name: fullName.trim(), phone: phone.trim() })
      onBackdropChange?.(backdropPreference)
      toast.success('Profile updated successfully')
      await onRefresh?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to update profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 pt-16 md:pt-20" onClick={onClose}>
      <GlassCard className="w-full max-w-lg p-6 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800/80">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-blue-500/20">
            {username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              My Profile
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400">
                {role}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">Manage your profile info. Editable fields are marked with ★.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Editable Section */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-blue-500/20 space-y-3.5">
            <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>★ Personal Details (Editable)</span>
            </div>

            <Field label="Username">
              <div className="relative">
                <User size={15} className="absolute left-3 top-3 text-zinc-500" />
                <TextInput
                  value={usernameInput}
                  onChange={setUsernameInput}
                  placeholder="Enter username"
                  className="pl-9"
                />
              </div>
            </Field>

            <Field label="Full Name">
              <div className="relative">
                <User size={15} className="absolute left-3 top-3 text-zinc-500" />
                <TextInput
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Enter full name"
                  className="pl-9"
                />
              </div>
            </Field>

            <Field label="Mobile Number">
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-3 text-zinc-500" />
                <TextInput
                  value={phone}
                  onChange={setPhone}
                  placeholder="Enter mobile phone number"
                  className="pl-9"
                />
              </div>
            </Field>

            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Background Theme</label>
              <button
                type="button"
                onClick={() => setBackdropPreference((v) => !v)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-700 bg-zinc-950/70 text-left text-sm text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                {backdropPreference ? 'On - Animated background visible' : 'Off - Plain background'}
              </button>
            </div>
          </div>

          {/* Read-Only Account Attributes Section */}
          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/80 space-y-3">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Lock size={12} className="text-zinc-500" />
              <span>Account Attributes (Read-Only)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Username (User ID)</label>
                <div className="px-3 py-2 bg-zinc-950/80 border border-zinc-800/60 rounded-xl text-xs text-zinc-300 font-mono truncate">
                  {usernameInput || '—'}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Email Address</label>
                <div className="px-3 py-2 bg-zinc-950/80 border border-zinc-800/60 rounded-xl text-xs text-zinc-300 truncate flex items-center gap-1.5">
                  <Mail size={12} className="text-zinc-500 shrink-0" />
                  <span className="truncate">{email}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Role & Authority</label>
                <div className="px-3 py-2 bg-zinc-950/80 border border-zinc-800/60 rounded-xl text-xs text-blue-300 truncate flex items-center gap-1.5">
                  <Shield size={12} className="text-blue-400 shrink-0" />
                  <span>{role}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Company / Client</label>
                <div className="px-3 py-2 bg-zinc-950/80 border border-zinc-800/60 rounded-xl text-xs text-zinc-300 truncate flex items-center gap-1.5">
                  <Building2 size={12} className="text-zinc-500 shrink-0" />
                  <span className="truncate">{company}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">Assigned Workspace</label>
              <div className="px-3 py-2 bg-zinc-950/80 border border-zinc-800/60 rounded-xl text-xs text-zinc-400 font-mono truncate flex items-center gap-1.5">
                <Layers size={12} className="text-zinc-500 shrink-0" />
                <span className="truncate">{workspace}</span>
              </div>
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Btn variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Btn>
            <Btn type="submit" disabled={busy} icon={CheckCircle} className="flex-1">
              {busy ? 'Saving...' : 'Save Profile'}
            </Btn>
          </div>
        </form>
      </GlassCard>
    </div>
  )
}

export default MyProfileModal
