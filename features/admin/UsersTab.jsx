import React, { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, Mail, Phone, Building2, Trash2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'
import { downloadTextFile } from '@/utils/formatters'
import CreateUserModal from './CreateUserModal'

export function UsersTab({ users = [], clients = [], onRefresh, isSuperAdmin, user = null }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  async function del(id, username) {
    if (!confirm(`Delete user ${username}? It can be restored from Bin.`)) return
    try {
      await api(`/users/${id}`, { method: 'DELETE' })
      toast.success('Moved to Bin')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function resetPassword(id, username) {
    const input = window.prompt(`Set temporary password for ${username} (leave blank to use default):`, '')
    if (input === null) return
    try {
      const body = input.trim() ? { new_password: input.trim() } : {}
      const r = await api(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify(body) })
      toast.success(`Temporary password for ${r.username}: ${r.temporary_password}`, { duration: 8000 })
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    }
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
    } catch (e) {
      toast.error(e.message)
    }
  }

  const filteredUsers = (users || []).filter((u) => {
    const q = query.trim().toLowerCase()
    const searchable = [u.username, u.first_name, u.last_name, u.email, u.phone, u.client_name, u.role]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (q && !searchable.includes(q)) return false
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    return true
  })

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase font-semibold tracking-wider text-zinc-500">User Directory</div>
          <div className="text-base font-bold text-zinc-100 mt-0.5">
            {users.length} Registered User{users.length !== 1 ? 's' : ''}
          </div>
        </div>
        {isSuperAdmin && (
          <Btn onClick={() => setShowCreateModal(true)} icon={UserPlus}>
            Create User
          </Btn>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="text-xs uppercase font-semibold tracking-wider text-zinc-500 mb-3 font-semibold">All Users</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search user, email, role, client..."
            className="md:col-span-2 h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="Super-Admin">Super-Admin</option>
            <option value="Admin">Admin</option>
            <option value="Client-Admin">Client-Admin</option>
            <option value="Client-User">Client-User</option>
          </select>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-sm text-zinc-500 py-6 text-center">No users found. Try refreshing.</div>
        )}
        <div className="space-y-2">
          {filteredUsers.map(u => {
            const isOwnerCategory = ['Super-Admin', 'Admin'].includes(u.role)
            const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ')
            const firstInitial = (u.first_name || u.username || 'U').slice(0, 1)
            const secondInitial = (u.last_name || u.username || 'S').slice(0, 1)
            const initials = (firstInitial + secondInitial).toUpperCase()

            return (
              <div key={u.id} className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors flex-wrap gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    isOwnerCategory
                      ? 'bg-purple-500/15 border border-purple-500/30 text-purple-300'
                      : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                  }`}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-zinc-100 flex items-center gap-2 flex-wrap">
                      <span>{fullName || u.username}</span>
                      <span className="text-[11px] font-mono text-zinc-400">@{u.username}</span>

                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
                        isOwnerCategory
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                      }`}>
                        {isOwnerCategory ? 'Owner' : 'Client'}
                      </span>

                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50 font-medium">
                        {u.role}
                      </span>

                      {u.must_change_password && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold">
                          Reset Pending
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
                      {u.email && (
                        <span className="flex items-center gap-1 text-zinc-300">
                          <Mail size={12} className="text-zinc-500" />
                          <span>{u.email}</span>
                        </span>
                      )}
                      {u.phone && (
                        <span className="flex items-center gap-1 text-zinc-400">
                          <Phone size={12} className="text-zinc-500" />
                          <span>{u.phone}</span>
                        </span>
                      )}
                      {u.client_name && (
                        <span className="flex items-center gap-1 text-zinc-400">
                          <Building2 size={12} className="text-zinc-500" />
                          <span>{u.client_name}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isSuperAdmin && u.username !== 'devbond01' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Btn size="sm" variant="ghost" onClick={() => generatePasscode(u.id, u.username)}>
                      Key File
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => resetPassword(u.id, u.username)}>
                      Reset Pwd
                    </Btn>
                    <button onClick={() => del(u.id, u.username)} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg transition-colors cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </GlassCard>

      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        clients={clients}
        onRefresh={onRefresh}
        existingUsers={users}
        user={user}
      />
    </div>
  )
}

export default UsersTab
