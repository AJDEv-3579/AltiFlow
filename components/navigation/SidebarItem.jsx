import React from 'react'

export function SidebarItem({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
  badge,
  badgeTone = 'blue',
}) {
  const badgeTones = {
    blue: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    amber: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    violet: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  }

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full h-9 flex items-center gap-2.5 px-2.5 rounded-xl text-[11px] font-semibold transition-all cursor-pointer group ${
        active
          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
      } ${collapsed ? 'justify-center px-0' : ''}`}
    >
      {Icon && <Icon size={18} className={`shrink-0 ${active ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'}`} />}
      {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full border ${badgeTones[badgeTone] || badgeTones.blue}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

export default SidebarItem
