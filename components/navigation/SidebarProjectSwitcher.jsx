import React, { useState, useRef, useEffect } from 'react'
import { Layers, ChevronDown, Plus, Search, Check, FolderKanban } from 'lucide-react'

export function SidebarProjectSwitcher({
  activeProject,
  projects = [],
  onSelectProject,
  onCreateProject,
  collapsed,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
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

  const filteredProjects = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.type?.toLowerCase().includes(search.toLowerCase()) ||
    p.head?.toLowerCase().includes(search.toLowerCase())
  )

  const activeName = activeProject ? activeProject.name : 'All Workspaces'
  const activeSub = activeProject ? (activeProject.type || 'Workspace') : `${projects.length} Active Workspaces`

  return (
    <div className="relative mb-3" ref={menuRef}>
      {/* Trigger Button */}
      {!collapsed ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800/90 hover:border-blue-500/40 hover:bg-zinc-900 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Layers size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="text-xs font-bold text-zinc-100 truncate group-hover:text-white transition-colors">
                {activeName}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">{activeSub}</div>
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 shrink-0 ml-1 ${
              open ? 'rotate-180 text-blue-400' : ''
            }`}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={activeName}
          className="w-10 h-10 mx-auto rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 hover:border-blue-500/60 transition-all cursor-pointer"
        >
          <Layers size={18} />
        </button>
      )}

      {/* Popover Menu */}
      {open && (
        <div
          className={`absolute left-0 mt-2 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-2xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 ${
            collapsed ? 'w-64 left-12' : 'w-full min-w-[260px]'
          }`}
        >
          {/* Search Header */}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
          </div>

          {/* Project List */}
          <div className="max-h-52 overflow-y-auto space-y-1 no-scrollbar my-1">
            {/* Global View / All Workspaces option */}
            <button
              type="button"
              onClick={() => {
                onSelectProject?.(null)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                !activeProject ? 'bg-blue-600/15 border border-blue-500/30 text-blue-300 font-semibold' : 'text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FolderKanban size={14} className={!activeProject ? 'text-blue-400' : 'text-zinc-500'} />
                <span className="truncate">All Workspaces (Global)</span>
              </div>
              {!activeProject && <Check size={14} className="text-blue-400 shrink-0" />}
            </button>

            {filteredProjects.map(p => {
              const isSelected = activeProject?.id === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProject?.(p)
                    setOpen(false)
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                    isSelected ? 'bg-blue-600/15 border border-blue-500/30 text-blue-300 font-semibold' : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                    <div className="truncate text-left">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{p.type} · {p.head}</div>
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="text-blue-400 shrink-0 ml-1" />}
                </button>
              )
            })}

            {filteredProjects.length === 0 && (
              <div className="text-center py-4 text-xs text-zinc-500">No matching projects</div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-2 mt-1 border-t border-zinc-800/80 flex items-center gap-1.5">
            {onCreateProject && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onCreateProject()
                }}
                className="flex-1 py-1.5 px-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>Create Project</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SidebarProjectSwitcher
