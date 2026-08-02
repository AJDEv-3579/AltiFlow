import {
  LayoutDashboard,
  Shield,
  Users,
  GitPullRequest,
  HelpCircle,
  BarChart3,
  FileWarning,
  AlertTriangle,
} from 'lucide-react'

export const GLOBAL_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { key: 'pipeline', label: 'Pipeline', icon: GitPullRequest, path: '/pipeline', roles: ['Super-Admin', 'Admin'] },
  { key: 'tracker', label: 'Project Tracker', icon: BarChart3, path: '/tracker' },
  { key: 'issues', label: 'Issue Tracker', icon: AlertTriangle, path: '/issues' },
  { key: 'team', label: 'Team Management', icon: Users, roles: ['Client-Admin', 'Client-User'], path: '/team' },
  { key: 'users', label: 'User Management', icon: Shield, roles: ['Super-Admin', 'Admin'], path: '/users' },
  { key: 'entity-delete-requests', label: 'Delete Requests', icon: FileWarning, path: '/delete-requests' },
  { key: 'support', label: 'Support Tickets', icon: HelpCircle, path: '/support' },
  { key: 'audit', label: 'Audit Logs', icon: Shield, roles: ['Super-Admin', 'Admin'], path: '/audit' },
]

export const PROJECT_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pipeline', label: 'Pipeline', icon: GitPullRequest },
  { key: 'tracker', label: 'Project Tracker', icon: BarChart3 },
  { key: 'issues', label: 'Issue Tracker', icon: AlertTriangle },
  { key: 'support', label: 'Support Tickets', icon: HelpCircle },
  { key: 'team', label: 'Team Management', icon: Users, roles: ['Client-Admin', 'Client-User'] },
  { key: 'entity-delete-requests', label: 'Delete Requests', icon: FileWarning },
]
