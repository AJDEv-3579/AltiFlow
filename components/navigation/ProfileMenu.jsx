import React, { useState, useRef, useEffect } from 'react'
import { User, KeyRound, LogOut, ChevronDown, Shield } from 'lucide-react'

export function ProfileMenu({ user, onOpenProfile, onOpenChangePassword, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const username = user?.username || 'User'
  const initials = username.slice(0, 2).toUpperCase()
  const role = user?.role || 'User'

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {initials}
        </div>
        <div className="text-left hidden sm:block">
          <div className="text-xs font-semibold text-zinc-100 group-hover:text-white transition-colors">{username}</div>
          <div className="text-[10px] text-zinc-400 font-medium leading-none">{role}</div>
        </div>
        <ChevronDown size={14} className={`text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-2.5 border-b border-zinc-800/80 mb-1">
            <div className="text-xs font-bold text-zinc-100 truncate">{user?.full_name || username}</div>
            <div className="text-[11px] text-zinc-400 truncate">{user?.email || `${username}@altiflow.io`}</div>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
              <Shield size={10} /> {role}
            </div>
          </div>

          <button
            onClick={() => { setOpen(false); onOpenProfile?.(); }}
            className="w-full px-4 py-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <User size={15} className="text-blue-400" />
            <span>My Profile</span>
          </button>

          <button
            onClick={() => { setOpen(false); onOpenChangePassword?.(); }}
            className="w-full px-4 py-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <KeyRound size={15} className="text-violet-400" />
            <span>Change Password</span>
          </button>

          <div className="my-1 border-t border-zinc-800/80" />

          <button
            onClick={() => { setOpen(false); onLogout?.(); }}
            className="w-full px-4 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfileMenu
