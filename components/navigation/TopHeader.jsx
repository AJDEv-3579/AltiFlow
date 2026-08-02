import React from 'react'
import PeriodChip from '@/components/ui/PeriodChip'
import NotificationsMenu from './NotificationsMenu'
import ProfileMenu from './ProfileMenu'

export function TopHeader({
  user,
  onLogout,
  onOpenProfile,
  onOpenChangePassword,
  onNotificationNavigate,
}) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-background/90 backdrop-blur-xl border-b border-border px-4 md:px-6 flex items-center justify-between gap-4">
      {/* Left: AltiFlow branding */}
      <div className="flex items-center gap-3 select-none shrink-0">
        <div className="hidden sm:block">
          <div className="font-extrabold tracking-tight text-xl bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent leading-none">
            Altiflow
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Operations Workspace</div>
        </div>
      </div>

      {/* Right: Notifications & User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        <PeriodChip />
        <NotificationsMenu user={user} onNavigate={onNotificationNavigate} />

        <ProfileMenu
          user={user}
          onOpenProfile={onOpenProfile}
          onOpenChangePassword={onOpenChangePassword}
          onLogout={onLogout}
        />
      </div>
    </header>
  )
}

export default TopHeader
