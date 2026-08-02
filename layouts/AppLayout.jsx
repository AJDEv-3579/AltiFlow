import React, { useState } from 'react'
import TopHeader from '@/components/navigation/TopHeader'
import Sidebar from '@/components/navigation/Sidebar'
import PeriodSwitcher from '@/components/ui/PeriodSwitcher'
import TimeBackdrop from '@/components/TimeBackdrop'

export function AppLayout({
  user,
  activeProject = null,
  projects = [],
  onSelectProject,
  onCreateProject,
  activeTab,
  onTabChange,
  onBackToGlobalProjects,
  onLogout,
  onOpenProfile,
  onOpenChangePassword,
  projectJobsCount = 0,
  onSidebarNavAction,
  onNotificationNavigate,
  showBackdrop = true,
  children,
}) {
  const [sidebarPinned, setSidebarPinned] = useState(false)

  function handleSidebarNavClick(nextTab, { isActive, isExpanded }) {
    if (isExpanded) {
      if (isActive) {
        setSidebarPinned(false)
      } else {
        setSidebarPinned(true)
      }
    }
    onSidebarNavAction?.(nextTab)
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-foreground selection:bg-blue-500/30 relative">
      {showBackdrop && <TimeBackdrop />}

      {/* Lightweight Top Header */}
      <TopHeader
        user={user}
        onLogout={onLogout}
        onOpenProfile={onOpenProfile}
        onOpenChangePassword={onOpenChangePassword}
        onNotificationNavigate={onNotificationNavigate}
      />

      {/* Main Layout Flex Container: Sidebar + Content */}
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Responsive Collapsible Left Sidebar */}
        <Sidebar
          user={user}
          activeProject={activeProject}
          projects={projects}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          pinned={sidebarPinned}
          activeTab={activeTab}
          onTabChange={handleSidebarNavClick}
          projectJobsCount={projectJobsCount}
        />

        {/* Main Content Area — Automatically occupies remaining space */}
        <main className="flex-1 min-w-0 py-6 px-4 md:px-8">
          {children}
        </main>
      </div>

      {/* Period Theme Switcher */}
      <PeriodSwitcher />
    </div>
  )
}

export default AppLayout
