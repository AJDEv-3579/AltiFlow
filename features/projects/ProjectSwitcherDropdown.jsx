import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, CheckCircle2 } from 'lucide-react'

export function ProjectSwitcherDropdown({ currentProject, projects = [], onSwitchProject }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter(p => (p.name || '').toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q))
  }, [projects, search])

  if (!currentProject) return null

  return (
    <div className="relative min-w-0 flex-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/70 transition-colors text-left group max-w-full sm:max-w-md cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-zinc-100 truncate group-hover:text-white flex items-center gap-1.5">
            <span>{currentProject.name}</span>
          </div>
          <div className="text-[11px] text-zinc-500 truncate">{currentProject.type} · {currentProject.head}</div>
        </div>
        <ChevronDown size={16} className={`text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180 text-blue-400' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Search input */}
            <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/40 sticky top-0 z-10">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            {/* Scrollable list */}
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-xs text-zinc-500 text-center">No projects found.</div>
              ) : (
                filtered.map(p => {
                  const isSelected = p.id === currentProject.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (!isSelected) onSwitchProject?.(p.id)
                        setOpen(false)
                        setSearch('')
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-500/15 text-blue-300 font-semibold border border-blue-500/30'
                          : 'text-zinc-300 hover:bg-zinc-900/80'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{p.type} · {p.head}</div>
                      </div>
                      {isSelected && <CheckCircle2 size={14} className="text-blue-400 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProjectSwitcherDropdown
