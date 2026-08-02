import React from 'react'
import { Layers } from 'lucide-react'
import PeriodChip from '../ui/PeriodChip'
import ProfileDropdown from './ProfileDropdown'

export function Topbar({ user, onLogout, onOpenProfile, onEditProfile, onOpenChangePassword }) {
  const handleProfile = onOpenProfile || onEditProfile

  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-zinc-800/60 backdrop-blur-md">
      <div className="px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Left: Application Logo */}
        <div className="flex items-center gap-3 select-none">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Layers size={18} className="text-white" />
          </div>
          <span className="font-extrabold tracking-tight text-xl bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
            Altiflow
          </span>
        </div>

        {/* Right: Period Indicator & Profile Dropdown */}
        <div className="flex items-center gap-3">
          <PeriodChip />
          <ProfileDropdown
            user={user}
            onOpenProfile={handleProfile}
            onOpenChangePassword={onOpenChangePassword}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  )
}

export default Topbar
