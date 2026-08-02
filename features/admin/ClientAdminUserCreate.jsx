import React, { useState } from 'react'
import { UserPlus } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import CreateUserModal from './CreateUserModal'

export function ClientAdminUserCreate({ onRefresh, clients = [], user = null }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <GlassCard className="p-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase font-semibold tracking-wider text-zinc-500 font-semibold">Add Team Member</div>
          <div className="text-xs text-zinc-400 mt-0.5">Create a new Client user account for your organization</div>
        </div>
        <Btn onClick={() => setShowModal(true)} icon={UserPlus}>
          Add Team Member
        </Btn>
      </GlassCard>
      <CreateUserModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        clients={clients}
        onRefresh={onRefresh}
        user={user}
      />
    </>
  )
}

export default ClientAdminUserCreate
