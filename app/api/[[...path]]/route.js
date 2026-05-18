import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabaseAdmin as sb } from '@/lib/supabase'

const JWT_SECRET = process.env.JWT_SECRET || 'altiflow_dev_secret'
const DEFAULT_TEAM_PWD = 'WelcometoAlti@123'

// ---------- Helpers ----------
function corsify(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}
function json(data, status = 200) { return corsify(NextResponse.json(data, { status })) }
function strip(doc) {
  if (!doc) return doc
  const { password_hash, ...rest } = doc
  return rest
}

// ---------- Seeding ----------
let seedDone = false
let seedError = null
async function ensureSeed() {
  if (seedDone) return
  try {
    // Probe — if tables don't exist, return a friendly setup error
    const { error: probeErr } = await sb.from('users').select('id').limit(1)
    if (probeErr) {
      seedError = `Supabase tables not found. Please run /app/supabase/schema.sql in the SQL Editor. (${probeErr.message})`
      console.error('[Altiflow]', seedError)
      return
    }
    seedError = null

    const { data: admin } = await sb.from('users').select('id').eq('username', 'devbond01').maybeSingle()
    if (!admin) {
      await sb.from('users').insert({
        id: uuidv4(),
        username: 'devbond01',
        password_hash: await bcrypt.hash('63pk0wpT@123', 10),
        role: 'Admin', client_id: null, must_change_password: false,
      })
    }
    let { data: bayer } = await sb.from('clients').select('*').eq('name', 'Bayer').maybeSingle()
    if (!bayer) {
      const { data } = await sb.from('clients').insert({ id: uuidv4(), name: 'Bayer', logo_url: '' }).select().single()
      bayer = data
    }
    if (bayer) {
      const { data: bayerUser } = await sb.from('users').select('id').eq('username', 'bayer').maybeSingle()
      if (!bayerUser) {
        await sb.from('users').insert({
          id: uuidv4(), username: 'bayer',
          password_hash: await bcrypt.hash(DEFAULT_TEAM_PWD, 10),
          role: 'Client', client_id: bayer.id, must_change_password: true,
        })
      }
    }
    for (const name of ['Rohit', 'Shalini', 'Advik']) {
      const { data: exists } = await sb.from('users').select('id').eq('username', name).maybeSingle()
      if (!exists) {
        await sb.from('users').insert({
          id: uuidv4(), username: name,
          password_hash: await bcrypt.hash(DEFAULT_TEAM_PWD, 10),
          role: 'Team', client_id: null, must_change_password: true,
        })
      }
    }
    seedDone = true
    console.log('[Altiflow] Seed complete')
  } catch (e) {
    seedError = `Seed failed: ${e.message}`
    console.error('[Altiflow]', seedError)
  }
}

async function getUserFromRequest(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const { data } = await sb.from('users').select('*').eq('id', decoded.sub).maybeSingle()
    return data
  } catch (e) { return null }
}

// ---------- SLA Engine ----------
async function calculateSlaDeadline(clientId, uploadTs) {
  const startOfDay = new Date(uploadTs); startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(uploadTs); endOfDay.setHours(23, 59, 59, 999)
  const { count } = await sb.from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('upload_timestamp', startOfDay.toISOString())
    .lte('upload_timestamp', endOfDay.toISOString())
  const total = (count || 0) + 1
  let hours = 24
  if (total >= 3 && total <= 4) hours = 48
  else if (total > 4) hours = 72
  return { deadline: new Date(uploadTs.getTime() + hours * 3600000), hours, dailyCount: total }
}

// ---------- Round Robin ----------
async function nextReflyAssignee() {
  const order = ['Rohit', 'Shalini', 'Advik']
  // Use Postgres function for atomic increment
  const { data, error } = await sb.rpc('next_rr_index')
  let idx = 0
  if (!error && typeof data === 'number') idx = data % order.length
  else {
    // fallback: read-then-write (less safe but works)
    const { data: row } = await sb.from('system_state').select('value').eq('key', 'refly_rr_index').maybeSingle()
    idx = (row?.value ?? 0) % order.length
    await sb.from('system_state').update({ value: (row?.value ?? 0) + 1 }).eq('key', 'refly_rr_index')
  }
  const { data: user } = await sb.from('users').select('*').eq('username', order[idx]).maybeSingle()
  return user
}

// ---------- Audit ----------
async function audit(projectId, user, desc) {
  await sb.from('audit_logs').insert({
    id: uuidv4(),
    project_id: projectId,
    user_id: user?.id || null,
    username: user?.username || 'system',
    action_desc: desc,
  })
}

// =====================================================================
export async function OPTIONS() { return corsify(new NextResponse(null, { status: 200 })) }

async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method
  try {
    await ensureSeed()

    if ((route === '/root' || route === '/') && method === 'GET') {
      return json({ message: 'Altiflow API online', service: 'altiflow', backend: 'supabase' })
    }

    if (route === '/health' && method === 'GET') {
      const { error: probeErr } = await sb.from('users').select('id').limit(1)
      return json({
        ok: true,
        backend: 'supabase',
        tables_ready: !probeErr,
        seed_done: seedDone,
        setup_error: seedError,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
      })
    }

    // --- AUTH ---
    if (route === '/auth/login' && method === 'POST') {
      const { username, password } = await request.json()
      if (!username || !password) return json({ error: 'username & password required' }, 400)
      const { data: user } = await sb.from('users').select('*').ilike('username', username).maybeSingle()
      if (!user) return json({ error: 'Invalid credentials' }, 401)
      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) return json({ error: 'Invalid credentials' }, 401)
      const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
      let clientData = null
      if (user.client_id) {
        const { data } = await sb.from('clients').select('*').eq('id', user.client_id).maybeSingle()
        clientData = data
      }
      return json({ token, user: { ...strip(user), client: clientData } })
    }

    if (route === '/auth/me' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      let clientData = null
      if (user.client_id) {
        const { data } = await sb.from('clients').select('*').eq('id', user.client_id).maybeSingle()
        clientData = data
      }
      return json({ user: { ...strip(user), client: clientData } })
    }

    if (route === '/auth/change-password' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { current_password, new_password } = await request.json()
      if (!new_password || new_password.length < 6) return json({ error: 'New password must be 6+ chars' }, 400)
      const ok = await bcrypt.compare(current_password || '', user.password_hash)
      if (!ok) return json({ error: 'Current password incorrect' }, 401)
      await sb.from('users').update({
        password_hash: await bcrypt.hash(new_password, 10),
        must_change_password: false,
      }).eq('id', user.id)
      return json({ success: true })
    }

    // --- CLIENTS ---
    if (route === '/clients' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { data } = await sb.from('clients').select('*').order('created_at', { ascending: false })
      return json({ clients: data || [] })
    }

    if (route === '/clients' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { name, logo_url } = await request.json()
      if (!name) return json({ error: 'name required' }, 400)
      const { data, error } = await sb.from('clients').insert({ id: uuidv4(), name, logo_url: logo_url || '' }).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ client: data })
    }

    if (route.startsWith('/clients/') && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      await sb.from('clients').delete().eq('id', id)
      return json({ success: true })
    }

    // --- USERS ---
    if (route === '/users' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { data: users } = await sb.from('users').select('*').order('created_at', { ascending: false })
      const { data: clients } = await sb.from('clients').select('*')
      const cmap = Object.fromEntries((clients || []).map(c => [c.id, c.name]))
      return json({ users: (users || []).map(u => ({ ...strip(u), client_name: cmap[u.client_id] || null })) })
    }

    if (route === '/users' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { username, role, client_id, password } = await request.json()
      if (!username || !role) return json({ error: 'username & role required' }, 400)
      const { data: exists } = await sb.from('users').select('id').ilike('username', username).maybeSingle()
      if (exists) return json({ error: 'Username already exists' }, 409)
      const pwd = password || DEFAULT_TEAM_PWD
      const newUser = {
        id: uuidv4(),
        username,
        password_hash: await bcrypt.hash(pwd, 10),
        role,
        client_id: role === 'Client' ? (client_id || null) : null,
        must_change_password: true,
      }
      const { data, error } = await sb.from('users').insert(newUser).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ user: strip(data), default_password: pwd })
    }

    if (route.startsWith('/users/') && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { data: target } = await sb.from('users').select('username').eq('id', id).maybeSingle()
      if (target?.username === 'devbond01') return json({ error: 'Cannot delete super admin' }, 400)
      await sb.from('users').delete().eq('id', id)
      return json({ success: true })
    }

    // --- PROJECTS ---
    if (route === '/projects' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      let q = sb.from('projects').select('*').order('upload_timestamp', { ascending: false })
      if (user.role === 'Client') q = q.eq('client_id', user.client_id)
      const { data: projects } = await q
      const { data: clients } = await sb.from('clients').select('*')
      const { data: users } = await sb.from('users').select('id, username')
      const cmap = Object.fromEntries((clients || []).map(c => [c.id, c]))
      const umap = Object.fromEntries((users || []).map(u => [u.id, u]))
      const enriched = (projects || []).map(p => {
        const result = { ...p, client_name: cmap[p.client_id]?.name || 'Unknown' }
        if (user.role !== 'Client') result.assignee_name = umap[p.assigned_to]?.username || null
        return result
      })
      return json({ projects: enriched })
    }

    if (route === '/projects' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json()
      const clientId = user.role === 'Client' ? user.client_id : body.client_id
      if (!clientId) return json({ error: 'client_id required' }, 400)
      const title = (body.title || `Project ${new Date().toLocaleDateString()}`).trim()
      const drone_name = (body.drone_name || '').trim()
      const capture_date = body.capture_date
      const image_count = parseInt(body.image_count, 10)
      const csv_count = parseInt(body.csv_count, 10)
      const base_rover_bool = !!body.base_rover_bool
      const grid_file_bool = !!body.grid_file_bool
      if (!drone_name || !capture_date || isNaN(image_count) || isNaN(csv_count)) {
        return json({ error: 'drone_name, capture_date, image_count, csv_count are required' }, 400)
      }
      const upload_timestamp = new Date()
      const { deadline, hours, dailyCount } = await calculateSlaDeadline(clientId, upload_timestamp)
      let status = 'Pending'
      let assigned_to = null
      let refly_reason = null
      if ((image_count - csv_count) > 10 && !base_rover_bool) {
        status = 'Failed_Refly'
        const assignee = await nextReflyAssignee()
        if (assignee) assigned_to = assignee.id
        refly_reason = `Image-CSV mismatch (${image_count - csv_count}) without Base/Rover correction.`
      }
      const project = {
        id: uuidv4(), client_id: clientId, title, drone_name, capture_date,
        upload_timestamp: upload_timestamp.toISOString(),
        image_count, csv_count, base_rover_bool, grid_file_bool, status, assigned_to,
        sla_deadline: deadline.toISOString(), sla_hours: hours, sla_daily_count: dailyCount,
        refly_reason,
      }
      const { data, error } = await sb.from('projects').insert(project).select().single()
      if (error) return json({ error: error.message }, 500)
      await audit(project.id, user, `Project created with status "${status}". SLA: ${hours}h (daily upload #${dailyCount}).`)
      if (status === 'Failed_Refly' && assigned_to) {
        const { data: assignee } = await sb.from('users').select('username').eq('id', assigned_to).maybeSingle()
        await audit(project.id, user, `Auto-flagged as Failed_Refly and assigned (round-robin) to ${assignee?.username}.`)
      }
      return json({ project: data })
    }

    if (route.startsWith('/projects/') && route.endsWith('/status') && method === 'PATCH') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (user.role === 'Client') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { status } = await request.json()
      const allowed = ['Pending', 'In-Download', 'QC', 'Processing', 'Delivery', 'Failed_Refly']
      if (!allowed.includes(status)) return json({ error: 'invalid status' }, 400)
      const { data: p } = await sb.from('projects').select('*').eq('id', id).maybeSingle()
      if (!p) return json({ error: 'project not found' }, 404)
      if (p.status === 'Failed_Refly' && !p.refly_resolved) {
        return json({ error: 'Card is locked. Resolve Refly with an issue note + photo first.' }, 423)
      }
      const updateFields = { status }
      if (user.role === 'Team') updateFields.assigned_to = user.id
      await sb.from('projects').update(updateFields).eq('id', id)
      await audit(id, user, `Status changed: ${p.status} → ${status}`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && route.endsWith('/issue-note') && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (user.role === 'Client') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { note, photo_data_url } = await request.json()
      if (!note || !photo_data_url) return json({ error: 'note & photo required' }, 400)
      const { data: p } = await sb.from('projects').select('id').eq('id', id).maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      await sb.from('projects').update({
        issue_note: note, issue_photo: photo_data_url, refly_resolved: true, status: 'Pending',
      }).eq('id', id)
      await audit(id, user, `Refly resolved: issue note + corrective photo uploaded by ${user.username}. Card unlocked → Pending.`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && route.endsWith('/confirm-delivery') && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const { data: p } = await sb.from('projects').select('*').eq('id', id).maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      if (user.role === 'Client' && p.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      if (p.status !== 'Delivery') return json({ error: 'project not in Delivery stage yet' }, 400)
      await sb.from('projects').update({ delivery_confirmed: true, delivery_confirmed_at: new Date().toISOString() }).eq('id', id)
      await audit(id, user, `Client confirmed delivery.`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const { data: p } = await sb.from('projects').select('*').eq('id', id).maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      if (user.role === 'Client' && p.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      const { data: logs } = await sb.from('audit_logs').select('*').eq('project_id', id).order('timestamp', { ascending: false })
      return json({ project: p, audit_logs: user.role === 'Client' ? [] : (logs || []) })
    }

    // --- AUDIT ---
    if (route === '/audit-logs' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { data } = await sb.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
      return json({ logs: data || [] })
    }

    // --- ANALYTICS ---
    if (route === '/analytics' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { data: projects } = await sb.from('projects').select('*')
      const { data: clients } = await sb.from('clients').select('*')
      const { data: users } = await sb.from('users').select('id')
      const now = Date.now()
      const byStatus = {}, bySla = { ok: 0, warning: 0, breached: 0 }, byClient = {}
      let refly = 0
      for (const p of (projects || [])) {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1
        if (p.status === 'Failed_Refly') refly++
        byClient[p.client_id] = (byClient[p.client_id] || 0) + 1
        const left = new Date(p.sla_deadline).getTime() - now
        if (left < 0) bySla.breached++
        else if (left < 4 * 3600000) bySla.warning++
        else bySla.ok++
      }
      return json({
        totals: { projects: (projects || []).length, clients: (clients || []).length, users: (users || []).length, refly },
        byStatus, bySla,
        byClient: (clients || []).map(c => ({ id: c.id, name: c.name, count: byClient[c.id] || 0 })),
      })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (e) {
    console.error('API Error:', e)
    return json({ error: 'Internal server error', detail: e.message }, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
