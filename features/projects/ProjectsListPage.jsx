import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, FolderOpen, Layers, Box, User, Calendar, Trash2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'
import CreateProjectModal from './CreateProjectModal'

export function ProjectsListPage({ user, projects = [], isAdmin, onNavigate, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false)

  async function deleteProject(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this workspace? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${id}`, { method: 'DELETE' })
      toast.success('Workspace moved to Bin')
      onRefresh?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Projects</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''} {user?.client?.name ? `· ${user.client.name}` : ''}
          </p>
        </div>
        {isAdmin && <Btn onClick={() => setShowCreate(true)} icon={Plus}>New Project</Btn>}
      </div>

      {projects.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-24">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-4">
            <FolderOpen size={28} className="text-zinc-600" />
          </div>
          <div className="text-xl font-semibold text-zinc-300 mb-2">No projects yet</div>
          {isAdmin ? (
            <>
              <div className="text-zinc-500 text-sm mb-6">Create your first project to get started</div>
              <Btn onClick={() => setShowCreate(true)} icon={Plus}>Create Project</Btn>
            </>
          ) : (
            <div className="text-zinc-500 text-sm">No projects have been shared with your workspace yet</div>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onNavigate(p)}
              className="group cursor-pointer"
            >
              <GlassCard className="p-5 hover:border-zinc-600 transition-all border border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <Layers size={20} className="text-blue-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-100 truncate text-base">{p.name}</div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-zinc-400 flex items-center gap-1"><Box size={11} />{p.type}</span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-400 flex items-center gap-1"><User size={11} />{p.head}</span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-400 flex items-center gap-1"><Calendar size={11} />{p.start_date}</span>
                        {p.end_date && (
                          <>
                            <span className="text-xs text-zinc-600">→</span>
                            <span className="text-xs text-zinc-400">{p.end_date}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {user?.role === 'Super-Admin' && (
                      <button
                        onClick={e => deleteProject(e, p.id)}
                        className="p-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-colors"
                        title="Delete workspace"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateProjectModal
            user={user}
            onDone={() => { setShowCreate(false); onRefresh?.(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProjectsListPage
