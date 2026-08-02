import React from 'react'

export function SidebarSection({ title, collapsed, children }) {
  return (
    <div className="space-y-1 mb-2">
      {!collapsed && title && (
        <div className="px-2.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1.5">
          {title}
        </div>
      )}
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}

export default SidebarSection
