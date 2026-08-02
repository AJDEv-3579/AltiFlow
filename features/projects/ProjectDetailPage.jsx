import React, { useState, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Layers, ChevronLeft, Settings, Trash2, FileWarning, User, LogOut, KeyRound,
  BarChart3, ClipboardList, Activity, Clock, AlertTriangle, Bell, Users
} from 'lucide-react'
import Backdrop from '@/components/TimeBackdrop'
import Btn from '@/components/ui/Btn'
import PeriodChip from '@/components/ui/PeriodChip'
import { api } from '@/services/api'
import ProjectSwitcherDropdown from './ProjectSwitcherDropdown'
import EditProjectInfoModal from './EditProjectInfoModal'
import ProjectDashboardTab from '../dashboard/ProjectDashboardTab'
import JobCardsTab from '../jobs/JobCardsTab'
import ProjectTrackerTab from '../tracker/ProjectTrackerTab'
import ProjectActivityLogTab from '../activity/ProjectActivityLogTab'
import IssueTrackerTab from '../tracker/IssueTrackerTab'
import SupportTicketsTab from '../support/SupportTicketsTab'
import EntityDeleteRequestsTab from '../queue/EntityDeleteRequestsTab'
import ProjectTeamTab from '../admin/ProjectTeamTab'

export function ProjectDetailPage({
  project,
  user,
  orgUsers = [],
  onBack,
  onLogout,
  onRefresh,
  showDashboard = true,
  showBack = true,
  projects = [],
  onSwitchProject,
  showProjectSwitcher = false,
  onEditProfile,
  onChangePassword,
}) {
  const [projectInfo, setProjectInfo] = useState(project)
  const [tab, setTab] = useState(showDashboard ? 'dashboard' : 'jobs')
  const [jobs, setJobs] = useState([])
  const [assignedUserIds, setAssignedUserIds] = useState([])
  const [showEditProject, setShowEditProject] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`altiflow_tab_${project.id}`)
      if (saved) setTab(saved)
    }
  }, [project.id])

  useEffect(() => {
    localStorage.setItem(`altiflow_tab_${projectInfo.id}`, tab)
  }, [tab, projectInfo.id])

  const jobsCacheRef = useRef(new Map())
  const isAdmin = ['Client-Admin', 'Admin', 'Super-Admin'].includes(user?.role)
  const canEditProjectInfo = ['Client-Admin', 'Admin', 'Super-Admin'].includes(user?.role)
  const canDeleteWorkspace = user?.role === 'Super-Admin'
  const canRequestDeleteWorkspace = ['Admin', 'Client-User'].includes(user?.role)
  const assignedUsers = orgUsers.filter(u => assignedUserIds.includes(u.id))

  useEffect(() => {
    setProjectInfo(project)
  }, [project])

  useEffect(() => {
    if (!showDashboard && tab === 'dashboard') setTab('jobs')
  }, [showDashboard, tab])

  async function loadJobs(projectId = project.id, { useCache = true } = {}) {
    if (useCache && jobsCacheRef.current.has(projectId)) {
      setJobs(jobsCacheRef.current.get(projectId) || [])
    }
    try {
      const r = await api(`/client-projects/${projectId}/jobs`)
      const list = r.jobs || []
      jobsCacheRef.current.set(projectId, list)
      setJobs(list)
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function loadAssignments(projectId = project.id) {
    try {
      const r = await api(`/projects/${projectId}/assigned-users`)
      setAssignedUserIds(r.user_ids || [])
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function saveAssignments(userIds) {
    try {
      await api(`/projects/${projectInfo.id}/assign-users`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds }),
      })
      toast.success('Team assignments saved')
      await loadAssignments(projectInfo.id)
      await onRefresh?.()
    } catch (e) {
      toast.error(e.message || 'Failed to save assignments')
    }
  }

  async function createTeamUser(username) {
    const r = await api('/users', {
      method: 'POST',
      body: JSON.stringify({ username, role: 'Client-User', client_id: projectInfo?.client_id }),
    })
    await onRefresh?.()
    return r.user
  }

  useEffect(() => {
    loadJobs(project.id)
    loadAssignments(project.id)
  }, [project.id])

  async function deleteWorkspace() {
    if (!canDeleteWorkspace) return
    if (!confirm('Delete this workspace? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${project.id}`, { method: 'DELETE' })
      toast.success('Workspace moved to Bin')
      await onRefresh?.()
      onBack?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function requestWorkspaceDelete() {
    if (!canRequestDeleteWorkspace) return
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'client_project', entity_id: projectInfo.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function handleProjectInfoUpdated(nextProject) {
    if (nextProject) setProjectInfo(prev => ({ ...prev, ...nextProject }))
    setShowEditProject(false)
    await onRefresh?.()
  }

  const tabs = [
    ...(showDashboard ? [{ k: 'dashboard', l: 'Dashboard', i: BarChart3 }] : []),
    { k: 'jobs', l: 'Job Cards', i: ClipboardList },
    { k: 'tracker', l: 'Project Tracker', i: Activity },
    { k: 'activity-log', l: 'Activity Console', i: Clock },
    { k: 'issues', l: 'Issue Tracker', i: AlertTriangle },
    { k: 'support', l: 'Support Tickets', i: Bell },
    ...(user?.role === 'Client-Admin' ? [{ k: 'delete-requests', l: 'Delete Requests', i: FileWarning }] : []),
    ...(isAdmin ? [{ k: 'team', l: 'Team', i: Users }] : []),
  ]

  return (
    <div className="min-h-screen relative pb-24">
      <Backdrop />
      <div className="sticky top-0 z-30 glass-strong border-b border-zinc-800/60">
        <div className="px-4 md:px-8 h-16 flex items-center gap-3">
          {showBack && (
            <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 shrink-0 cursor-pointer">
              <ChevronLeft size={18} />
            </button>
          )}
          {showProjectSwitcher && projects.length > 1 ? (
            <ProjectSwitcherDropdown
              currentProject={projectInfo}
              projects={projects}
              onSwitchProject={onSwitchProject}
            />
          ) : (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
                <Layers size={16} className="text-blue-300" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate text-zinc-100">{projectInfo.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{projectInfo.type} · {projectInfo.head}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <PeriodChip />
            {canEditProjectInfo && <Btn onClick={() => setShowEditProject(true)} variant="outline" size="sm" icon={Settings}>Edit Info</Btn>}
            {canDeleteWorkspace && <Btn onClick={deleteWorkspace} variant="danger" size="sm" icon={Trash2}>Delete Workspace</Btn>}
            {canRequestDeleteWorkspace && <Btn onClick={requestWorkspaceDelete} variant="ghost" size="sm" icon={FileWarning}>Request Delete</Btn>}
            {onEditProfile && <Btn onClick={onEditProfile} variant="ghost" size="sm" icon={User}>Profile</Btn>}
            {onChangePassword && <Btn onClick={onChangePassword} variant="ghost" size="sm" icon={KeyRound}>Password</Btn>}
            {onLogout && <Btn onClick={onLogout} variant="ghost" size="sm" icon={LogOut}>Sign out</Btn>}
          </div>
        </div>
        <div className="flex gap-1 px-4 md:px-8 pb-3 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-3 h-9 text-sm rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                tab === t.k ? 'bg-zinc-100 text-zinc-900 font-semibold' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}>
              <t.i size={14} />{t.l}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 md:px-8 py-6 relative z-10">
        {tab === 'dashboard' && <ProjectDashboardTab project={projectInfo} jobs={jobs} teamMembers={assignedUsers} user={user} orgUsers={orgUsers} onRefresh={loadJobs} isAdmin={isAdmin} />}
        {tab === 'jobs' && <JobCardsTab project={projectInfo} user={user} orgUsers={orgUsers} jobs={jobs} onRefresh={loadJobs} isAdmin={isAdmin} />}
        {tab === 'tracker' && <ProjectTrackerTab project={projectInfo} jobs={jobs} canExport={true} />}
        {tab === 'activity-log' && <ProjectActivityLogTab project={projectInfo} user={user} />}
        {tab === 'issues' && <IssueTrackerTab project={projectInfo} jobs={jobs} onRefresh={loadJobs} />}
        {tab === 'support' && <SupportTicketsTab user={user} />}
        {tab === 'delete-requests' && <EntityDeleteRequestsTab user={user} />}
        {tab === 'team' && isAdmin && (
          <ProjectTeamTab
            project={projectInfo}
            orgUsers={orgUsers}
            assignedUserIds={assignedUserIds}
            onCreateUser={createTeamUser}
            onSaveAssignments={saveAssignments}
            onRefresh={onRefresh}
            user={user}
            clients={projects}
          />
        )}
      </div>

      <AnimatePresence>
        {showEditProject && (
          <EditProjectInfoModal
            project={projectInfo}
            onDone={handleProjectInfoUpdated}
            onCancel={() => setShowEditProject(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProjectDetailPage
