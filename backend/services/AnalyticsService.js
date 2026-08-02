import { ProjectRepository } from '../repositories/ProjectRepository'
import { JobRepository } from '../repositories/JobRepository'
import { UserRepository } from '../repositories/UserRepository'
import { INTERNAL_ROLES, SUPER_ADMIN, ADMIN } from '../constants/backendRoles'

export class AnalyticsService {
  static async getAnalytics(user) {
    if (!INTERNAL_ROLES.includes(user.role)) throw { message: 'Forbidden', status: 403 }

    const supportsAdvancedJobSchema = await JobRepository.hasAdvancedSchema()
    const projects = await ProjectRepository.getLegacyProjects({ user: { role: 'Super-Admin' }, from: 0, to: 1000 })
    const clientProjects = await ProjectRepository.getClientProjects({ user: { role: 'Super-Admin' }, from: 0, to: 1000 })
    const jobs = await JobRepository.getAssignedJobs({ role: 'Super-Admin' }, 0, 2000)
    const clients = await ProjectRepository.getClients()
    const users = await UserRepository.getAllUsers('id, role, username')

    const now = Date.now()
    const byStatus = {}, bySla = { ok: 0, warning: 0, breached: 0 }, byClient = {}
    let refly = 0

    for (const p of projects) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1
      if (p.status === 'Failed_Refly') refly++
      byClient[p.client_id] = (byClient[p.client_id] || 0) + 1
      if (p.sla_deadline) {
        const left = new Date(p.sla_deadline).getTime() - now
        if (left < 0) bySla.breached++
        else if (left < 4 * 3600000) bySla.warning++
        else bySla.ok++
      }
    }

    for (const cp of clientProjects) {
      byClient[cp.client_id] = (byClient[cp.client_id] || 0) + 1
    }

    const hasLegacySlaData = projects.some(p => p?.sla_deadline)
    if (!hasLegacySlaData) {
      bySla.ok = 0
      bySla.warning = 0
      bySla.breached = 0
      for (const j of jobs) {
        const createdAtMs = new Date(j.created_at).getTime()
        if (Number.isNaN(createdAtMs)) continue
        const left = (createdAtMs + (24 * 3600000)) - now
        const scDone = j.sc_status === 'Done'
        const uniDone = j.uni_status === 'Done'
        const statusDone = j.status === 'Done'
        const done = statusDone || (supportsAdvancedJobSchema && scDone && uniDone)
        if (done) {
          bySla.ok += 1
        } else if (left < 0) {
          bySla.breached += 1
        } else if (left < 4 * 3600000) {
          bySla.warning += 1
        } else {
          bySla.ok += 1
        }
      }
    }

    const monthKeys = []
    const weekKeys = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    for (let i = 7; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      weekKeys.push(`${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, '0')}`)
    }

    const byMonthMap = Object.fromEntries(monthKeys.map(k => [k, 0]))
    const byWeekMap = Object.fromEntries(weekKeys.map(k => [k, 0]))
    for (const j of jobs) {
      const dt = new Date(j.created_at)
      if (Number.isNaN(dt.getTime())) continue
      const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (mk in byMonthMap) byMonthMap[mk] += 1
      const wk = `${dt.getFullYear()}-W${String(Math.ceil(dt.getDate() / 7)).padStart(2, '0')}`
      if (wk in byWeekMap) byWeekMap[wk] += 1
    }

    const fieldJobsByMonth = monthKeys.map(key => {
      const [y, m] = key.split('-')
      return { key, label: `${m}/${y.slice(2)}`, count: byMonthMap[key] || 0 }
    })
    const fieldJobsByWeek = weekKeys.map(key => ({ key, label: key, count: byWeekMap[key] || 0 }))

    const scJobs = jobs.filter(j => (j.category || 'Stand Count') === 'Stand Count')
    const uniJobs = jobs.filter(j => j.category === 'Uniformity')

    const scDone = scJobs.filter(j => j.sc_status === 'Done').length
    const scStats = {
      total: scJobs.length,
      done: scDone,
      in_progress: scJobs.filter(j => j.sc_status === 'In Progress').length,
      blocked: scJobs.filter(j => j.sc_status === 'Blocked').length,
      need_delivery: scJobs.length - scDone,
    }

    const uniDone = uniJobs.filter(j => j.uni_status === 'Done').length
    const uniStats = {
      total: uniJobs.length,
      done: uniDone,
      in_progress: uniJobs.filter(j => j.uni_status === 'In Progress').length,
      blocked: uniJobs.filter(j => j.uni_status === 'Blocked').length,
      need_delivery: uniJobs.length - uniDone,
    }

    const monthDeliveredMap = Object.fromEntries(monthKeys.map(k => [k, { created: 0, delivered: 0 }]))
    for (const j of jobs) {
      const createdAt = new Date(j.created_at)
      if (!Number.isNaN(createdAt.getTime())) {
        const mk = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
        if (mk in monthDeliveredMap) {
          monthDeliveredMap[mk].created += 1
          const isDone = j.status === 'Done' || (supportsAdvancedJobSchema && j.sc_status === 'Done' && j.uni_status === 'Done')
          if (isDone) monthDeliveredMap[mk].delivered += 1
        }
      }
    }

    const jobsByMonthWithDelivery = monthKeys.map(key => {
      const [y, m] = key.split('-')
      return {
        key,
        label: `${m}/${y.slice(2)}`,
        created: monthDeliveredMap[key]?.created || 0,
        delivered: monthDeliveredMap[key]?.delivered || 0,
      }
    })

    let adminAssignments = []
    if (user.role === SUPER_ADMIN && supportsAdvancedJobSchema) {
      const admins = users.filter(u => u.role === ADMIN)
      const adminMap = Object.fromEntries(admins.map(a => [a.id, a.username]))
      const adminJobMap = {}

      for (const job of jobs) {
        if (!job.assigned_to) continue
        if (!adminJobMap[job.assigned_to]) {
          adminJobMap[job.assigned_to] = {
            admin_id: job.assigned_to,
            admin_name: adminMap[job.assigned_to] || 'Unknown',
            total_jobs: 0,
            sc_count: 0,
            uni_count: 0,
            done_count: 0,
            projects: {},
          }
        }
        adminJobMap[job.assigned_to].total_jobs += 1
        if (job.category === 'Stand Count' || !job.category) adminJobMap[job.assigned_to].sc_count += 1
        if (job.category === 'Uniformity') adminJobMap[job.assigned_to].uni_count += 1
        if (job.status === 'Done' || (job.sc_status === 'Done' && job.uni_status === 'Done')) {
          adminJobMap[job.assigned_to].done_count += 1
        }
        if (job.project_id) {
          if (!adminJobMap[job.assigned_to].projects[job.project_id]) {
            adminJobMap[job.assigned_to].projects[job.project_id] = {
              total_jobs: 0,
              sc_count: 0,
              uni_count: 0,
              done_count: 0,
            }
          }
          const projectStats = adminJobMap[job.assigned_to].projects[job.project_id]
          projectStats.total_jobs += 1
          if (job.category === 'Stand Count' || !job.category) projectStats.sc_count += 1
          if (job.category === 'Uniformity') projectStats.uni_count += 1
          if (job.status === 'Done' || (job.sc_status === 'Done' && job.uni_status === 'Done')) {
            projectStats.done_count += 1
          }
        }
      }
      adminAssignments = Object.values(adminJobMap).sort((a, b) => b.total_jobs - a.total_jobs)
    }

    return {
      totals: {
        projects: clientProjects.length,
        client_workspaces: clientProjects.length,
        legacy_projects: projects.length,
        field_jobs: jobs.length,
        clients: clients.length,
        users: users.length,
        refly,
      },
      byStatus,
      bySla,
      fieldJobsByMonth,
      fieldJobsByWeek,
      jobsByMonthWithDelivery,
      jobCardStats: {
        stand_count: scStats,
        uniformity: uniStats,
      },
      adminAssignments: user.role === SUPER_ADMIN ? adminAssignments : [],
      byClient: clients.map(c => ({ id: c.id, name: c.name, count: byClient[c.id] || 0 })),
    }
  }
}
