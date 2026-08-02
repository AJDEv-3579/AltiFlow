'use client'

import React, { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { RefreshCw, LogOut } from 'lucide-react'
import Backdrop from '@/components/TimeBackdrop'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import PeriodSwitcher from '@/components/ui/PeriodSwitcher'
import { AuthProvider, useAuth } from '@/stores/AuthContext'
import AppLayout from '@/layouts/AppLayout'
import Login from '@/features/auth/Login'
import ChangePassword from '@/features/auth/ChangePassword'
import { api } from '@/services/api'

const MyProfileModal = dynamic(() => import('@/features/auth/MyProfileModal'))
const ProjectDashboardTab = dynamic(() => import('@/features/dashboard/ProjectDashboardTab'))
const ClientsTab = dynamic(() => import('@/features/admin/ClientsTab'))
const UsersTab = dynamic(() => import('@/features/admin/UsersTab'))
const AuditTab = dynamic(() => import('@/features/activity/AuditTab'))
const EntityDeleteRequestsTab = dynamic(() => import('@/features/queue/EntityDeleteRequestsTab'))
const RecycleBinTab = dynamic(() => import('@/features/queue/RecycleBinTab'))
const SupportTicketsTab = dynamic(() => import('@/features/support/SupportTicketsTab'))
const JobCardsTab = dynamic(() => import('@/features/jobs/JobCardsTab'))
const JobPipelineKanban = dynamic(() => import('@/features/pipeline/JobPipelineKanban'))
const ProjectTrackerTab = dynamic(() => import('@/features/tracker/ProjectTrackerTab'))
const IssueTrackerTab = dynamic(() => import('@/features/tracker/IssueTrackerTab'))
const ProjectTeamTab = dynamic(() => import('@/features/admin/ProjectTeamTab'))
const CreateProjectModal = dynamic(() => import('@/features/projects/CreateProjectModal'))

function ProjectSelectionEmptyState({ message }) {
  return (
    <GlassCard className="p-10 text-center">
      <div className="text-zinc-200 font-semibold">Select an Active Project</div>
      <div className="text-sm text-zinc-500 mt-2">{message}</div>
    </GlassCard>
  )
}

function AltiFlowMain() {
  const { user, loading, logout, reloadUser } = useAuth()
  const [showProfile, setShowProfile] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showBackdrop, setShowBackdrop] = useState(true)

  const [dashboardData, setDashboardData] = useState({
    analytics: null,
    projects: [],
    clientProjects: [],
    clients: [],
    users: [],
    recycle_bin: [],
    deletion_requests: [],
    audit_logs: [],
  })
  const [caProjects, setCaProjects] = useState([])
  const [caOrgUsers, setCaOrgUsers] = useState([])
  const [cuProjects, setCuProjects] = useState([])
  const [cuScreen, setCuScreen] = useState('waiting')
  const [loadingCuProject, setLoadingCuProject] = useState(false)

  const [activeProjectId, setActiveProjectId] = useState(null)
  const [projectJobs, setProjectJobs] = useState([])
  const [assignedUserIds, setAssignedUserIds] = useState([])

  const isInternal = ['Super-Admin', 'Admin'].includes(user?.role)
  const isSuperAdmin = user?.role === 'Super-Admin'
  const isClientAdmin = user?.role === 'Client-Admin'
  const isClientUser = user?.role === 'Client-User'
  const canManageTeam = ['Super-Admin', 'Admin', 'Client-Admin'].includes(user?.role)
  const canUsePipeline = isInternal

  async function loadAdminData({ tab = activeTab, force = false } = {}) {
    if (!isInternal) return
    try {
      const shouldLoadUsers = force || tab === 'users' || tab === 'team'
      const shouldLoadClients = force || tab === 'clients' || tab === 'users' || (isSuperAdmin && showCreateProject)
      const shouldLoadRecycle = isSuperAdmin && (force || tab === 'recycle-bin')
      const shouldLoadDeleteRequests = isSuperAdmin && (force || tab === 'entity-delete-requests')
      const shouldLoadAudit = isSuperAdmin && (force || tab === 'audit')

      const requests = []
      requests.push(['analytics', api('/analytics')])
      requests.push(['clientProjects', api('/client-projects')])
      if (shouldLoadUsers) requests.push(['users', api('/users')])
      if (shouldLoadClients) requests.push(['clients', api('/clients')])
      if (shouldLoadRecycle) requests.push(['recycle_bin', api('/recycle-bin')])
      if (shouldLoadDeleteRequests) requests.push(['deletion_requests', api('/deletion-requests')])
      if (shouldLoadAudit) requests.push(['audit_logs', api('/audit-logs')])

      const responses = await Promise.all(requests.map(([, p]) => p))
      setDashboardData((prev) => {
        const next = { ...(prev || {}) }
        requests.forEach(([key], idx) => {
          const res = responses[idx] || {}
          if (key === 'analytics') next.analytics = res
          if (key === 'clientProjects') next.clientProjects = res.projects || []
          if (key === 'users') next.users = res.users || []
          if (key === 'clients') next.clients = res.clients || []
          if (key === 'recycle_bin') next.recycle_bin = res.items || []
          if (key === 'deletion_requests') next.deletion_requests = res.requests || []
          if (key === 'audit_logs') next.audit_logs = res.logs || []
        })
        return next
      })
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function loadCaData() {
    if (!isClientAdmin) return
    try {
      const [pr, ur] = await Promise.all([api('/client-projects'), api('/users')])
      setCaProjects(pr.projects || [])
      setCaOrgUsers(ur.users || [])
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function loadCuData() {
    if (!isClientUser) return
    setLoadingCuProject(true)
    try {
      const r = await api('/client-projects')
      const projectsList = r.projects || []
      setCuProjects(projectsList)
      setCuScreen(projectsList.length > 0 ? 'workspace' : 'waiting')
    } catch (e) {
      toast.error(e.message)
      setCuScreen('waiting')
    } finally {
      setLoadingCuProject(false)
    }
  }

  async function loadProjectJobs(projectId) {
    if (!projectId) {
      setProjectJobs([])
      return
    }
    try {
      const r = await api(`/client-projects/${projectId}/jobs`)
      setProjectJobs(r.jobs || [])
    } catch (e) {
      toast.error(e.message)
      setProjectJobs([])
    }
  }

  async function movePipelineJob(job, targetStage) {
    if (!job?.id || !job?.project_id) return
    try {
      const payload = job.category === 'Uniformity'
        ? { uni_status: targetStage }
        : { sc_status: targetStage }
      await api(`/client-projects/${job.project_id}/jobs/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      await refreshProjectAwareModules(activeProjectId)
    } catch (e) {
      toast.error(e.message)
    }
  }

  function handleNotificationNavigate(notification) {
    if (!notification) return

    if (notification.project_id) {
      setActiveProjectId(notification.project_id)
    }

    if (notification.target_type === 'support-ticket') {
      setActiveTab('support')
      return
    }

    if (notification.target_type === 'job') {
      if (notification.type === 'job-cancelled') {
        setActiveTab('issues')
      } else {
        setActiveTab('jobs')
      }
    }
  }

  async function loadProjectAssignments(projectId) {
    if (!projectId || !canManageTeam) {
      setAssignedUserIds([])
      return
    }
    try {
      const r = await api(`/projects/${projectId}/assigned-users`)
      setAssignedUserIds(r.user_ids || [])
    } catch (e) {
      setAssignedUserIds([])
      toast.error(e.message)
    }
  }

  async function refreshProjectAwareModules(projectId) {
    await Promise.all([
      loadProjectJobs(projectId),
      loadProjectAssignments(projectId),
    ])
  }

  async function saveAssignments(userIds) {
    if (!activeProjectId) return
    try {
      await api(`/projects/${activeProjectId}/assign-users`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds }),
      })
      toast.success('Team assignments saved')
      await loadProjectAssignments(activeProjectId)
      await reloadRoleData({ force: true })
    } catch (e) {
      toast.error(e.message || 'Failed to save assignments')
    }
  }

  async function createTeamUser(username) {
    const payload = {
      username,
      role: 'Client-User',
      client_id: user?.client_id || null,
    }
    const r = await api('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    await reloadRoleData({ force: true })
    return r.user
  }

  async function reloadRoleData({ force = false } = {}) {
    if (!user) return
    if (isInternal) await loadAdminData({ tab: activeTab, force })
    if (isClientAdmin) await loadCaData()
    if (isClientUser) await loadCuData()
  }

  function setBackdropPreference(enabled) {
    const value = Boolean(enabled)
    setShowBackdrop(value)
    if (typeof window !== 'undefined' && user?.id) {
      localStorage.setItem(`altiflow_backdrop_enabled_${user.id}`, value ? '1' : '0')
    }
  }

  useEffect(() => {
    if (!user) return

    setActiveTab('dashboard')

    if (typeof window !== 'undefined') {
      const savedBackdrop = localStorage.getItem(`altiflow_backdrop_enabled_${user.id}`)
      setShowBackdrop(savedBackdrop !== '0')
    }

    reloadRoleData()
  }, [user?.id, user?.role])

  useEffect(() => {
    if (!user) return
    if (user.role === 'Client-User' && (activeTab === 'dashboard' || activeTab === 'team')) {
      setActiveTab('jobs')
    }
  }, [user?.role, activeTab])

  useEffect(() => {
    if (!user || !isInternal) return
    loadAdminData({ tab: activeTab })
  }, [user?.id, activeTab, isInternal, isSuperAdmin, showCreateProject])

  const availableProjects = useMemo(() => {
    if (isInternal) return dashboardData?.clientProjects || []
    if (isClientAdmin) return caProjects
    return cuProjects
  }, [isInternal, isClientAdmin, dashboardData?.clientProjects, caProjects, cuProjects])

  const orgUsers = useMemo(() => {
    if (isInternal) return dashboardData?.users || []
    if (isClientAdmin) return caOrgUsers
    return []
  }, [isInternal, isClientAdmin, dashboardData?.users, caOrgUsers])

  useEffect(() => {
    if (!user) return

    const storageKey = `altiflow_active_project_id_${user.id}`
    const ids = new Set((availableProjects || []).map(p => p.id))

    let nextId = activeProjectId
    if (!nextId && typeof window !== 'undefined') {
      nextId = localStorage.getItem(storageKey)
    }

    if (!nextId || !ids.has(nextId)) {
      nextId = availableProjects?.[0]?.id || null
    }

    if (nextId !== activeProjectId) {
      setActiveProjectId(nextId)
    }
  }, [user?.id, availableProjects])

  useEffect(() => {
    if (!user) return
    const storageKey = `altiflow_active_project_id_${user.id}`

    if (typeof window !== 'undefined') {
      if (activeProjectId) {
        localStorage.setItem(storageKey, activeProjectId)
      } else {
        localStorage.removeItem(storageKey)
      }
    }

    refreshProjectAwareModules(activeProjectId)
  }, [user?.id, activeProjectId])

  const activeProject = useMemo(
    () => (availableProjects || []).find(p => p.id === activeProjectId) || null,
    [availableProjects, activeProjectId],
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-background text-foreground">
        <Backdrop />
        <PeriodSwitcher />
        <div className="text-zinc-300 text-sm flex items-center gap-2 px-5 py-2.5 rounded-full glass border border-zinc-800">
          <RefreshCw className="animate-spin text-blue-400" size={16} /> Loading AltiFlow...
        </div>
      </div>
    )
  }

  if (!user) return <><Login onLogin={reloadUser} /><PeriodSwitcher /></>
  if (user.must_change_password) return <><ChangePassword user={user} onDone={reloadUser} /><PeriodSwitcher /></>

  if (isClientUser && cuScreen === 'waiting') {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center relative px-4 bg-background">
          <Backdrop />
          <GlassCard className="relative z-10 p-8 max-w-md text-center border border-zinc-800">
            <div className="text-xl font-semibold text-zinc-100 mb-2">Workspace not assigned yet</div>
            <div className="text-sm text-zinc-500">Your project will appear here once it is assigned.</div>
            {loadingCuProject && (
              <div className="text-xs text-zinc-400 mt-3 flex items-center justify-center gap-2">
                <RefreshCw size={12} className="animate-spin text-blue-400" /> Checking for updates...
              </div>
            )}
            <div className="mt-6 flex justify-center">
              <Btn onClick={logout} variant="ghost" size="sm" icon={LogOut}>Sign out</Btn>
            </div>
          </GlassCard>
        </div>
        <PeriodSwitcher />
      </>
    )
  }

  const projectRequiredState = (
    <ProjectSelectionEmptyState message="Choose an active project from the global switcher in the sidebar to load this module." />
  )

  return (
    <AppLayout
      user={user}
      activeProject={activeProject}
      projects={availableProjects}
      onSelectProject={(project) => {
        setActiveProjectId(project?.id || null)
      }}
      onCreateProject={['Super-Admin', 'Client-Admin'].includes(user.role) ? () => setShowCreateProject(true) : undefined}
      onLogout={logout}
      onOpenProfile={() => setShowProfile(true)}
      onOpenChangePassword={() => setShowChangePassword(true)}
      activeTab={activeTab}
      onSidebarNavAction={(nextTab) => {
        if (nextTab === 'pipeline' && !canUsePipeline) return
        setActiveTab(nextTab)
      }}
      onNotificationNavigate={handleNotificationNavigate}
      projectJobsCount={projectJobs.length}
      showBackdrop={showBackdrop}
    >
      {activeTab === 'dashboard' && (
        activeProject
          ? (
            <ProjectDashboardTab
              project={activeProject}
              jobs={projectJobs}
              user={user}
              orgUsers={orgUsers}
              onRefresh={() => refreshProjectAwareModules(activeProject.id)}
              isAdmin={canManageTeam}
              isSuperAdmin={isSuperAdmin}
              adminAssignments={dashboardData?.analytics?.adminAssignments || []}
            />
          )
          : projectRequiredState
      )}

      {activeTab === 'clients' && isInternal && (
        <ClientsTab
          clients={dashboardData?.clients || []}
          onRefresh={() => reloadRoleData({ force: true })}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {activeTab === 'pipeline' && canUsePipeline && (
        activeProject
          ? (
            <JobPipelineKanban
              jobs={projectJobs}
              user={user}
              onMove={movePipelineJob}
            />
          )
          : projectRequiredState
      )}

      {activeTab === 'jobs' && (
        activeProject
          ? (
            <JobCardsTab
              project={activeProject}
              user={user}
              orgUsers={orgUsers}
              jobs={projectJobs}
              onRefresh={() => refreshProjectAwareModules(activeProject.id)}
              isAdmin={canManageTeam}
            />
          )
          : projectRequiredState
      )}

      {activeTab === 'issues' && (
        activeProject
          ? (
            <IssueTrackerTab
              project={activeProject}
              jobs={projectJobs}
              onRefresh={() => refreshProjectAwareModules(activeProject.id)}
            />
          )
          : projectRequiredState
      )}

      {activeTab === 'tracker' && (
        activeProject
          ? <ProjectTrackerTab project={activeProject} jobs={projectJobs} canExport={true} />
          : projectRequiredState
      )}

      {activeTab === 'support' && <SupportTicketsTab user={user} project={activeProject} />}

      {activeTab === 'team' && canManageTeam && (
        activeProject
          ? (
            <ProjectTeamTab
              project={activeProject}
              orgUsers={orgUsers}
              assignedUserIds={assignedUserIds}
              onCreateUser={createTeamUser}
              onSaveAssignments={saveAssignments}
              onRefresh={reloadRoleData}
              user={user}
              clients={availableProjects}
            />
          )
          : projectRequiredState
      )}

      {activeTab === 'team' && !canManageTeam && (
        <ProjectSelectionEmptyState message="Team management is not available for your role." />
      )}

      {activeTab === 'users' && (
        <UsersTab
          users={orgUsers}
          clients={isInternal ? (dashboardData?.clients || []) : []}
          onRefresh={reloadRoleData}
          isSuperAdmin={isSuperAdmin}
          user={user}
        />
      )}

      {activeTab === 'entity-delete-requests' && (
        <EntityDeleteRequestsTab user={user} />
      )}

      {activeTab === 'recycle-bin' && isSuperAdmin && (
        <RecycleBinTab items={dashboardData?.recycle_bin || []} onRefresh={reloadRoleData} />
      )}

      {activeTab === 'audit' && isSuperAdmin && (
        <AuditTab logs={dashboardData?.audit_logs || []} />
      )}

      {showProfile && (
        <MyProfileModal
          user={user}
          onRefresh={reloadUser}
          onClose={() => setShowProfile(false)}
          backdropEnabled={showBackdrop}
          onBackdropChange={setBackdropPreference}
        />
      )}
      {showChangePassword && <ChangePassword user={user} onDone={reloadUser} onClose={() => setShowChangePassword(false)} />}
      {showCreateProject && (
        <CreateProjectModal
          user={user}
          onDone={() => {
            setShowCreateProject(false)
            reloadRoleData({ force: true })
          }}
          onCancel={() => setShowCreateProject(false)}
        />
      )}
    </AppLayout>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <AltiFlowMain />
    </AuthProvider>
  )
}
