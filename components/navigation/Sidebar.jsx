import React, { useMemo, useState } from 'react'
import {
  LayoutDashboard,
  Shield,
  Users,
  ClipboardList,
  GitPullRequest,
  HelpCircle,
  BarChart3,
  FileWarning,
  AlertTriangle,
} from 'lucide-react'
import SidebarItem from './SidebarItem'
import SidebarSection from './SidebarSection'
import SidebarProjectSwitcher from './SidebarProjectSwitcher'

export function Sidebar({
  user,
  activeProject = null,
  projects = [],
  onSelectProject,
  onCreateProject,
  pinned = false,
  activeTab,
  onTabChange,
}) {
  const [hovered, setHovered] = useState(false)
  const collapsed = !pinned && !hovered

  const role = user?.role || 'User'
  const isInternal = ['Super-Admin', 'Admin'].includes(role)
  const isClientAdmin = role === 'Client-Admin'
  const isClientUser = role === 'Client-User'

  const navItems = useMemo(() => {
    if (isInternal) {
      const internalItems = [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { key: 'jobs', label: 'Job Cards', icon: ClipboardList },
        { key: 'pipeline', label: 'Pipeline', icon: GitPullRequest },
        { key: 'tracker', label: 'Project Tracker', icon: BarChart3 },
        { key: 'issues', label: 'Issue Tracker', icon: AlertTriangle },
        { key: 'users', label: 'User Management', icon: Shield },
        { key: 'entity-delete-requests', label: 'Delete Requests', icon: FileWarning },
        { key: 'support', label: 'Support Tickets', icon: HelpCircle },
      ]

      if (role === 'Super-Admin') {
        internalItems.push(
          { key: 'recycle-bin', label: 'Recycle Bin', icon: FileWarning },
          { key: 'audit', label: 'Audit Logs', icon: Shield },
          { key: 'clients', label: 'Clients', icon: Users },
        )
      }

      return internalItems
    }

    if (isClientAdmin) {
      return [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { key: 'jobs', label: 'Job Cards', icon: ClipboardList },
        { key: 'tracker', label: 'Project Tracker', icon: BarChart3 },
        { key: 'issues', label: 'Issue Tracker', icon: AlertTriangle },
        { key: 'team', label: 'Team Management', icon: Users },
        { key: 'entity-delete-requests', label: 'Delete Requests', icon: FileWarning },
        { key: 'support', label: 'Support Tickets', icon: HelpCircle },
      ]
    }

    if (isClientUser) {
      return [
        { key: 'jobs', label: 'Job Cards', icon: ClipboardList },
        { key: 'tracker', label: 'Project Tracker', icon: BarChart3 },
        { key: 'issues', label: 'Issue Tracker', icon: AlertTriangle },
        { key: 'entity-delete-requests', label: 'Delete Requests', icon: FileWarning },
        { key: 'support', label: 'Support Tickets', icon: HelpCircle },
      ]
    }

    return [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }]
  }, [isInternal, isClientAdmin, isClientUser])

  function handleItemClick(itemKey) {
    const isActive = activeTab === itemKey
    const isExpanded = !collapsed
    onTabChange?.(itemKey, { isActive, isExpanded })
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`sticky top-16 h-[calc(100vh-4rem)] shrink-0 z-20 bg-background/95 backdrop-blur-xl border-r border-border transition-[width] duration-300 ease-out flex flex-col select-none ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="px-2.5 pt-2.5 pb-2 border-b border-border shrink-0">
        <SidebarProjectSwitcher
          activeProject={activeProject}
          projects={projects}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          collapsed={collapsed}
        />
      </div>

      <div className="px-2.5 py-2 flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <SidebarSection title="Navigation" collapsed={collapsed}>
          {navItems.map(item => (
            <SidebarItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.key}
              collapsed={collapsed}
              onClick={() => handleItemClick(item.key)}
            />
          ))}
        </SidebarSection>
      </div>
    </aside>
  )
}

export default Sidebar
