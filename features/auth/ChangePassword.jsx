import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Lock, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Field from '@/components/ui/Field'
import TextInput from '@/components/ui/TextInput'
import Btn from '@/components/ui/Btn'
import { authService } from '@/services/authService'

export function ChangePassword({ user, onDone, onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [busy, setBusy] = useState(false)
  const mustChangeNow = Boolean(user?.must_change_password)

  async function submit(e) {
    e.preventDefault()
    if (next !== confirmNext) {
      toast.error('New password and confirm password do not match')
      return
    }
    if (next.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setBusy(true)
    try {
      const payload = {
        currentPassword: current,
        newPassword: next,
      }
      await authService.changePassword(payload)
      toast.success('Password updated.')
      if (onDone) onDone()
      if (onClose) onClose()
    } catch (e) {
      const msg = String(e.message || '')
      if (msg.includes('schema.sql')) {
        toast.error('Database migration missing. Run supabase/schema.sql first, then retry password update.')
      } else {
        toast.error(msg || 'Failed to update password')
      }
    } finally {
      setBusy(false)
    }
  }

  const passwordsMatch = Boolean(next && confirmNext && next === confirmNext)
  const passwordsMismatch = Boolean(next && confirmNext && next !== confirmNext)

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 pt-16 md:pt-20" onClick={!mustChangeNow ? onClose : undefined}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10" onClick={(e) => e.stopPropagation()}>
        <GlassCard className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Lock className="text-amber-400" size={18} />
              </div>
              <div>
                <div className="text-lg font-semibold text-zinc-100">Set a new password</div>
                <div className="text-xs text-zinc-500">
                  {mustChangeNow ? `First-time login — required for ${user.username}` : `Password management for ${user?.username}`}
                </div>
              </div>
            </div>
            {onClose && !mustChangeNow && (
              <button onClick={onClose} className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Current password">
              <TextInput value={current} onChange={setCurrent} type="password" placeholder="Enter current password" />
            </Field>

            <Field label="New password" hint="At least 6 characters.">
              <TextInput value={next} onChange={setNext} type="password" placeholder="••••••••" />
            </Field>

            <Field label="Confirm new password">
              <TextInput value={confirmNext} onChange={setConfirmNext} type="password" placeholder="••••••••" />
            </Field>

            {passwordsMismatch && (
              <div className="text-xs text-red-400 font-medium">✕ Passwords do not match</div>
            )}
            {passwordsMatch && (
              <div className="text-xs text-emerald-400 font-medium">✓ Passwords match</div>
            )}

            <div className="flex gap-2">
              {onClose && !mustChangeNow && (
                <Btn variant="ghost" onClick={onClose} className="flex-1">Cancel</Btn>
              )}
              <Btn type="submit" disabled={busy || !current || next.length < 6 || next !== confirmNext} className="flex-1">
                {busy ? 'Updating…' : 'Update password'}
              </Btn>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}

export default ChangePassword
