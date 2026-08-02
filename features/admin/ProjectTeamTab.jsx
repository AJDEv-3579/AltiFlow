import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import ClientAdminUserCreate from './ClientAdminUserCreate'

export function ProjectTeamTab({ project, orgUsers = [], assignedUserIds = [], onCreateUser, onSaveAssignments, onRefresh, user = null, clients = [] }) {
  const [selectedIds, setSelectedIds] = useState(assignedUserIds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedIds(assignedUserIds)
  }, [assignedUserIds, project.id])

  const teamUsers = orgUsers.filter(u => u.role === 'Client-User')

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
      <ClientAdminUserCreate onRefresh={onRefresh} user={user} clients={clients} />

      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Assign to Project</div>
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
                    <div className="text-sm text-zinc-100 font-medium truncate">{member.username}</div>
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
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0 cursor-pointer"
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

export default ProjectTeamTab
