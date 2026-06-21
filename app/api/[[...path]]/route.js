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

// ---------- Role helpers ----------
const SUPER_ADMIN = 'Super-Admin'
const ADMIN       = 'Admin'
const CLIENT_ADMIN = 'Client-Admin'
const CLIENT_USER  = 'Client-User'
const INTERNAL_ROLES = [SUPER_ADMIN, ADMIN]
const CLIENT_ROLES   = [CLIENT_ADMIN, CLIENT_USER]

function generatePasscode(length = 6) {
  const min = 10 ** (length - 1)
  const max = (10 ** length) - 1
  return String(Math.floor(min + Math.random() * (max - min + 1)))
}

async function ensurePasswordResetCodesTable() {
  const { error } = await sb.from('password_reset_codes').select('id').limit(1)
  if (error) {
    throw new Error('password_reset_codes table missing. Run the latest supabase/schema.sql migration first.')
  }
}

// ---------- Seeding ----------
// Only seeds the one Super-Admin account.
// All other users must be created manually via the Super-Admin panel.
// This prevents deleted users from reappearing after serverless cold-starts.
let seedDone = false
let seedError = null
async function ensureSeed() {
  if (seedDone) return
  try {
    // Probe — if tables don't exist, return a friendly setup error
    const { error: probeErr } = await sb.from('users').select('id').limit(1)
    if (probeErr) {
      seedError = `Supabase tables not found. Please run /supabase/schema.sql in the SQL Editor. (${probeErr.message})`
      console.error('[Altiflow]', seedError)
      return
    }
    seedError = null

    const { data: superAdmin } = await sb.from('users').select('id').eq('username', 'devbond01').maybeSingle()
    if (!superAdmin) {
      await sb.from('users').insert({
        id: uuidv4(),
        username: 'devbond01',
        password_hash: await bcrypt.hash('63pk0wpT@123', 10),
        role: SUPER_ADMIN, client_id: null, must_change_password: false,
      })
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

async function nextJobAdminAssignee() {
  const { data: admins, error: adminErr } = await sb.from('users').select('id').eq('role', ADMIN).order('created_at', { ascending: true })
  if (adminErr || !admins || admins.length === 0) return null

  // Keep a separate counter from refly round-robin so both systems are independent.
  const stateKey = 'job_admin_rr_index'
  const { data: state } = await sb.from('system_state').select('value').eq('key', stateKey).maybeSingle()
  if (!state) {
    await sb.from('system_state').insert({ key: stateKey, value: 0 })
  }
  const current = state?.value ?? 0
  const idx = current % admins.length
  await sb.from('system_state').update({ value: current + 1 }).eq('key', stateKey)
  return admins[idx]
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

async function addJobComment(jobId, user, comment, stage = 'General') {
  if (!comment?.trim()) return
  await sb.from('job_comments').insert({
    id: uuidv4(),
    job_id: jobId,
    user_id: user?.id || null,
    username: user?.username || 'system',
    stage,
    comment: comment.trim(),
  })
}

async function moveToRecycleBin({ tableName, entityType, id, user, scope = null }) {
  let fetchQuery = sb.from(tableName).select('*').eq('id', id)
  if (scope?.field && scope?.value !== undefined) fetchQuery = fetchQuery.eq(scope.field, scope.value)
  const { data: row, error: fetchError } = await fetchQuery.maybeSingle()
  if (fetchError) throw new Error(fetchError.message)
  if (!row) return { ok: false, reason: 'not_found' }

  const { error: binError } = await sb.from('recycle_bin').insert({
    id: uuidv4(),
    entity_type: entityType,
    table_name: tableName,
    entity_id: row.id,
    payload: row,
    deleted_by: user?.id || null,
    deleted_by_username: user?.username || 'system',
  })
  if (binError) throw new Error(binError.message)

  let deleteQuery = sb.from(tableName).delete().eq('id', id)
  if (scope?.field && scope?.value !== undefined) deleteQuery = deleteQuery.eq(scope.field, scope.value)
  const { error: deleteError } = await deleteQuery
  if (deleteError) throw new Error(deleteError.message)
  return { ok: true, row }
}

async function restoreFromRecycleBin(entry, user) {
  const tableName = entry.table_name
  const payload = { ...(entry.payload || {}) }
  if (!payload.id) throw new Error('Invalid recycle bin payload')

  const { error: restoreError } = await sb.from(tableName).upsert(payload, { onConflict: 'id' })
  if (restoreError) throw new Error(restoreError.message)

  await sb.from('recycle_bin').update({
    restored_at: new Date().toISOString(),
    restored_by: user?.id || null,
    restored_by_username: user?.username || 'system',
  }).eq('id', entry.id)
}

async function resolveEntityScope(entityType, entityId) {
  if (entityType === 'job') {
    const { data: job } = await sb.from('jobs').select('id, project_id').eq('id', entityId).maybeSingle()
    if (!job) return null
    const { data: project } = await sb.from('client_projects').select('id, client_id').eq('id', job.project_id).maybeSingle()
    if (!project) return null
    return { tableName: 'jobs', entityType, id: entityId, client_id: project.client_id, scope: { field: 'project_id', value: job.project_id } }
  }
  if (entityType === 'client_project') {
    const { data: project } = await sb.from('client_projects').select('id, client_id').eq('id', entityId).maybeSingle()
    if (!project) return null
    return { tableName: 'client_projects', entityType, id: entityId, client_id: project.client_id, scope: null }
  }
  if (entityType === 'project') {
    const { data: project } = await sb.from('projects').select('id, client_id').eq('id', entityId).maybeSingle()
    if (!project) return null
    return { tableName: 'projects', entityType, id: entityId, client_id: project.client_id, scope: null }
  }
  return null
}

// =====================================================================
export async function OPTIONS() { return corsify(new NextResponse(null, { status: 200 })) }

async function handleRoute(request, context) {
  const { path = [] } = await context.params
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
        ok: !probeErr,
        backend: 'supabase',
        tables_ready: !probeErr,
        seed_done: seedDone,
        setup_error: seedError,
        probe_error: probeErr ? probeErr.message : null,
        supabase_url: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '') || null,
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

    if (route === '/auth/forgot-password' && method === 'POST') {
      await ensurePasswordResetCodesTable()
      const { username, passcode, new_password } = await request.json()
      if (!username || !passcode || !new_password) {
        return json({ error: 'username, passcode and new_password are required' }, 400)
      }
      if (new_password.length < 6) return json({ error: 'New password must be 6+ chars' }, 400)

      const { data: user } = await sb.from('users').select('*').ilike('username', username).maybeSingle()
      if (!user) return json({ error: 'Invalid username or passcode' }, 401)

      const nowIso = new Date().toISOString()
      const { data: codeRow } = await sb
        .from('password_reset_codes')
        .select('*')
        .eq('user_id', user.id)
        .is('consumed_at', null)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .maybeSingle()

      if (!codeRow) return json({ error: 'Passcode not found or expired' }, 401)

      const isValidCode = await bcrypt.compare(String(passcode), codeRow.code_hash)
      if (!isValidCode) {
        await sb.from('password_reset_codes').update({ attempts: (codeRow.attempts || 0) + 1 }).eq('id', codeRow.id)
        return json({ error: 'Invalid username or passcode' }, 401)
      }

      await sb.from('users').update({
        password_hash: await bcrypt.hash(new_password, 10),
        must_change_password: false,
      }).eq('id', user.id)

      await sb.from('password_reset_codes').update({
        consumed_at: new Date().toISOString(),
      }).eq('id', codeRow.id)

      return json({ success: true })
    }

    // --- CLIENTS ---
    if (route === '/clients' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || !INTERNAL_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const { data } = await sb.from('clients').select('*').order('created_at', { ascending: false })
      return json({ clients: data || [] })
    }

    if (route === '/clients' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const { name, logo_url } = await request.json()
      if (!name) return json({ error: 'name required' }, 400)
      const { data, error } = await sb.from('clients').insert({ id: uuidv4(), name, logo_url: logo_url || '' }).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ client: data })
    }

    if (route.startsWith('/clients/') && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const moved = await moveToRecycleBin({ tableName: 'clients', entityType: 'client', id, user })
      if (!moved.ok) return json({ error: 'Client not found' }, 404)
      return json({ success: true })
    }

    // --- USERS ---
    if (route === '/users' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      // Super-Admin/Admin see all users; Client-Admin sees only their org's Client-Users
      if (INTERNAL_ROLES.includes(user.role)) {
        const { data: users } = await sb.from('users').select('*').order('created_at', { ascending: false })
        const { data: clients } = await sb.from('clients').select('*')
        const cmap = Object.fromEntries((clients || []).map(c => [c.id, c.name]))
        return json({ users: (users || []).map(u => ({ ...strip(u), client_name: cmap[u.client_id] || null })) })
      }
      if (user.role === CLIENT_ADMIN) {
        const { data: users } = await sb.from('users').select('*')
          .eq('client_id', user.client_id).eq('role', CLIENT_USER)
          .order('created_at', { ascending: false })
        return json({ users: (users || []).map(u => strip(u)) })
      }
      return json({ error: 'Forbidden' }, 403)
    }

    if (route === '/users' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { username, role, client_id, password } = await request.json()
      if (!username || !role) return json({ error: 'username & role required' }, 400)
      // Super-Admin can create any role; Client-Admin can only create Client-User in their org
      if (user.role === CLIENT_ADMIN) {
        if (role !== CLIENT_USER) return json({ error: 'Client-Admin can only create Client-User accounts' }, 403)
      } else if (!INTERNAL_ROLES.includes(user.role)) {
        return json({ error: 'Forbidden' }, 403)
      }
      // Admin role cannot create users — only Super-Admin
      if (user.role === ADMIN) return json({ error: 'Forbidden — only Super-Admin can create users' }, 403)
      const { data: exists } = await sb.from('users').select('id').ilike('username', username).maybeSingle()
      if (exists) return json({ error: 'Username already exists' }, 409)
      const pwd = password || DEFAULT_TEAM_PWD
      const assignedClientId = user.role === CLIENT_ADMIN ? user.client_id : (CLIENT_ROLES.includes(role) ? (client_id || null) : null)
      const newUser = {
        id: uuidv4(), username,
        password_hash: await bcrypt.hash(pwd, 10),
        role, client_id: assignedClientId,
        must_change_password: true,
      }
      const { data, error } = await sb.from('users').insert(newUser).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ user: strip(data), default_password: pwd })
    }

    if (route.startsWith('/users/') && !route.includes('/request-deletion') && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden — only Super-Admin can delete users' }, 403)
      const id = route.split('/')[2]
      const { data: target } = await sb.from('users').select('id, username').eq('id', id).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)
      if (target?.username === 'devbond01') return json({ error: 'Cannot delete Super-Admin' }, 400)
      await moveToRecycleBin({ tableName: 'users', entityType: 'user', id, user })
      return json({ success: true })
    }

    if (route.match(/^\/users\/[^/]+\/reset-password$/) && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden — only Super-Admin can reset passwords' }, 403)

      const targetId = route.split('/')[2]
      const { new_password } = await request.json().catch(() => ({}))
      const password = (new_password || DEFAULT_TEAM_PWD).trim()
      if (password.length < 6) return json({ error: 'Password must be 6+ chars' }, 400)

      const { data: target } = await sb.from('users').select('id, username').eq('id', targetId).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)
      if (target.username === 'devbond01') return json({ error: 'Cannot reset Super-Admin root account through this action' }, 400)

      await sb.from('users').update({
        password_hash: await bcrypt.hash(password, 10),
        must_change_password: true,
      }).eq('id', targetId)

      return json({ success: true, username: target.username, temporary_password: password })
    }

    if (route.match(/^\/users\/[^/]+\/reset-passcode$/) && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden — only Super-Admin can generate reset passcodes' }, 403)
      await ensurePasswordResetCodesTable()

      const targetId = route.split('/')[2]
      const { expires_minutes } = await request.json().catch(() => ({}))
      const ttl = Math.max(5, Math.min(60, parseInt(expires_minutes, 10) || 15))

      const { data: target } = await sb.from('users').select('id, username').eq('id', targetId).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)

      const passcode = generatePasscode(6)
      const expiresAt = new Date(Date.now() + ttl * 60000)

      await sb.from('password_reset_codes').update({ consumed_at: new Date().toISOString() })
        .eq('user_id', targetId).is('consumed_at', null)

      const { error } = await sb.from('password_reset_codes').insert({
        id: uuidv4(),
        user_id: targetId,
        code_hash: await bcrypt.hash(passcode, 10),
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
        attempts: 0,
      })
      if (error) return json({ error: error.message }, 500)

      return json({
        success: true,
        username: target.username,
        passcode,
        expires_at: expiresAt.toISOString(),
      })
    }

    // Client-Admin requests deletion of a Client-User
    if (route.startsWith('/users/') && route.endsWith('/request-deletion') && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== CLIENT_ADMIN) return json({ error: 'Forbidden' }, 403)
      const targetId = route.split('/')[2]
      const { reason } = await request.json().catch(() => ({}))
      // Ensure target belongs to same client and is a Client-User
      const { data: target } = await sb.from('users').select('*').eq('id', targetId).maybeSingle()
      if (!target || target.client_id !== user.client_id || target.role !== CLIENT_USER)
        return json({ error: 'User not found in your organization' }, 404)
      // Prevent duplicate pending request
      const { data: existing } = await sb.from('delete_requests')
        .select('id').eq('target_user_id', targetId).eq('status', 'pending').maybeSingle()
      if (existing) return json({ error: 'Deletion already requested for this user' }, 409)
      await sb.from('delete_requests').insert({
        id: uuidv4(), target_user_id: targetId, requested_by: user.id, reason: reason || null, status: 'pending',
      })
      return json({ success: true })
    }

    // Super-Admin: list pending deletion requests
    if (route === '/deletion-requests' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const { data } = await sb.from('delete_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true })
      if (!data || data.length === 0) return json({ requests: [] })
      // Enrich with user info
      const userIds = [...new Set(data.flatMap(r => [r.target_user_id, r.requested_by]))]
      const { data: users } = await sb.from('users').select('id, username, role, client_id').in('id', userIds)
      const { data: clients } = await sb.from('clients').select('id, name')
      const umap = Object.fromEntries((users || []).map(u => [u.id, u]))
      const cmap = Object.fromEntries((clients || []).map(c => [c.id, c.name]))
      return json({
        requests: data.map(r => ({
          ...r,
          target_username: umap[r.target_user_id]?.username,
          target_role: umap[r.target_user_id]?.role,
          target_client: cmap[umap[r.target_user_id]?.client_id] || null,
          requested_by_username: umap[r.requested_by]?.username,
        })),
      })
    }

    // Super-Admin: approve or reject a deletion request
    if (route.startsWith('/deletion-requests/') && method === 'PATCH') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { action } = await request.json() // 'approve' | 'reject'
      if (!['approve', 'reject'].includes(action)) return json({ error: 'action must be approve or reject' }, 400)
      const { data: req } = await sb.from('delete_requests').select('*').eq('id', id).maybeSingle()
      if (!req || req.status !== 'pending') return json({ error: 'Request not found or already resolved' }, 404)
      await sb.from('delete_requests').update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id)
      if (action === 'approve') {
        const { data: target } = await sb.from('users').select('username').eq('id', req.target_user_id).maybeSingle()
        if (target?.username === 'devbond01') return json({ error: 'Cannot delete Super-Admin' }, 400)
        await moveToRecycleBin({ tableName: 'users', entityType: 'user', id: req.target_user_id, user })
      }
      return json({ success: true })
    }

    if (route === '/recycle-bin' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const { data, error } = await sb.from('recycle_bin').select('*').order('deleted_at', { ascending: false }).limit(300)
      if (error) return json({ error: error.message }, 500)
      return json({ items: data || [] })
    }

    if (route === '/entity-delete-requests' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (![CLIENT_USER, CLIENT_ADMIN, ADMIN].includes(user.role)) return json({ error: 'Forbidden' }, 403)

      const { entity_type, entity_id, reason } = await request.json()
      if (!entity_type || !entity_id) return json({ error: 'entity_type and entity_id are required' }, 400)

      const resolved = await resolveEntityScope(entity_type, entity_id)
      if (!resolved) return json({ error: 'Entity not found' }, 404)

      const targetRole = user.role === CLIENT_USER ? CLIENT_ADMIN : SUPER_ADMIN
      if (user.role === CLIENT_USER && resolved.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      if (user.role === CLIENT_ADMIN && resolved.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)

      const { data: existing } = await sb.from('entity_delete_requests')
        .select('id')
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .eq('status', 'pending')
        .maybeSingle()
      if (existing) return json({ error: 'Delete request already pending for this item' }, 409)

      const { error } = await sb.from('entity_delete_requests').insert({
        id: uuidv4(),
        entity_type,
        entity_id,
        table_name: resolved.tableName,
        client_id: resolved.client_id || null,
        requested_by: user.id,
        requested_by_username: user.username,
        requested_by_role: user.role,
        target_role: targetRole,
        reason: (reason || '').trim() || null,
      })
      if (error) return json({ error: error.message }, 500)
      return json({ success: true }, 201)
    }

    if (route === '/entity-delete-requests' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)

      let q = sb.from('entity_delete_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false })
      if (user.role === SUPER_ADMIN) {
        q = q.eq('target_role', SUPER_ADMIN)
      } else if (user.role === CLIENT_ADMIN) {
        q = q.eq('target_role', CLIENT_ADMIN).eq('client_id', user.client_id)
      } else {
        q = q.eq('requested_by', user.id)
      }
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ requests: data || [] })
    }

    if (route.match(/^\/entity-delete-requests\/[^/]+$/) && method === 'PATCH') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const { action } = await request.json()
      if (!['approve', 'reject'].includes(action)) return json({ error: 'action must be approve or reject' }, 400)

      const { data: req } = await sb.from('entity_delete_requests').select('*').eq('id', id).maybeSingle()
      if (!req || req.status !== 'pending') return json({ error: 'Request not found or already resolved' }, 404)

      if (user.role === SUPER_ADMIN) {
        if (req.target_role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      } else if (user.role === CLIENT_ADMIN) {
        if (req.target_role !== CLIENT_ADMIN || req.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      } else {
        return json({ error: 'Forbidden' }, 403)
      }

      if (action === 'approve') {
        const resolved = await resolveEntityScope(req.entity_type, req.entity_id)
        if (!resolved) return json({ error: 'Entity no longer exists' }, 409)
        if (user.role === CLIENT_ADMIN && resolved.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
        await moveToRecycleBin({
          tableName: resolved.tableName,
          entityType: req.entity_type,
          id: req.entity_id,
          user,
          scope: resolved.scope,
        })
      }

      await sb.from('entity_delete_requests').update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: user.id,
        reviewed_by_username: user.username,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id)

      return json({ success: true })
    }

    if (route.match(/^\/recycle-bin\/[^/]+\/restore$/) && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { data: entry, error } = await sb.from('recycle_bin').select('*').eq('id', id).maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!entry) return json({ error: 'Recycle entry not found' }, 404)
      if (entry.restored_at) return json({ error: 'Entry already restored' }, 409)
      await restoreFromRecycleBin(entry, user)
      return json({ success: true })
    }

    // --- USER_PROJECTS (project assignment for Client-User) ---
    if (route.match(/^\/projects\/[^/]+\/assign-users$/) && method === 'POST') {
      const user = await getUserFromRequest(request)
      const projectId = route.split('/')[2]
      const { user_ids } = await request.json()
      if (!Array.isArray(user_ids)) return json({ error: 'user_ids array required' }, 400)
      if (!user) return json({ error: 'Unauthorized' }, 401)

      const { data: project } = await sb.from('projects').select('id, client_id').eq('id', projectId).maybeSingle()
      if (!project) return json({ error: 'Project not found' }, 404)

      if (user.role === CLIENT_ADMIN) {
        const { data: validUsers } = await sb.from('users')
          .select('id')
          .in('id', user_ids)
          .eq('client_id', user.client_id)
          .eq('role', CLIENT_USER)
        if (project.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
        if ((validUsers || []).length !== user_ids.length) return json({ error: 'One or more users are not in your organization' }, 400)
      } else {
        if (!INTERNAL_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
        if (user.role === ADMIN) return json({ error: 'Forbidden — only Super-Admin can assign users' }, 403)
      }

      // Remove existing assignments then re-add
      await sb.from('user_projects').delete().eq('project_id', projectId)
      if (user_ids.length > 0) {
        await sb.from('user_projects').insert(user_ids.map(uid => ({ id: uuidv4(), user_id: uid, project_id: projectId })))
      }
      return json({ success: true })
    }

    if (route.match(/^\/projects\/[^/]+\/assigned-users$/) && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const projectId = route.split('/')[2]
      const { data } = await sb.from('user_projects').select('user_id').eq('project_id', projectId)
      return json({ user_ids: (data || []).map(r => r.user_id) })
    }

    // --- SUPPORT TICKETS (App-level issues; independent from project issue tracker) ---
    if (route === '/support-tickets' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || (![...INTERNAL_ROLES, ...CLIENT_ROLES].includes(user.role))) return json({ error: 'Forbidden' }, 403)

      let q = sb.from('support_tickets').select('*').order('created_at', { ascending: false })
      if (CLIENT_ROLES.includes(user.role)) q = q.eq('client_id', user.client_id)
      const { data: tickets, error } = await q
      if (error) return json({ error: error.message }, 500)

      const creatorIds = [...new Set((tickets || []).map(t => t.created_by))]
      const clientIds = [...new Set((tickets || []).map(t => t.client_id).filter(Boolean))]
      const { data: creators } = creatorIds.length > 0
        ? await sb.from('users').select('id, username, role').in('id', creatorIds)
        : { data: [] }
      const { data: clients } = clientIds.length > 0
        ? await sb.from('clients').select('id, name').in('id', clientIds)
        : { data: [] }

      const creatorMap = Object.fromEntries((creators || []).map(u => [u.id, u]))
      const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c.name]))
      return json({
        tickets: (tickets || []).map(t => ({
          ...t,
          created_by_name: creatorMap[t.created_by]?.username || null,
          created_by_role: creatorMap[t.created_by]?.role || null,
          client_name: t.client_id ? (clientMap[t.client_id] || null) : null,
        })),
      })
    }

    if (route === '/support-tickets' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || (![ADMIN, CLIENT_ADMIN, CLIENT_USER].includes(user.role))) return json({ error: 'Forbidden' }, 403)
      const { title, description, severity } = await request.json()
      if (!title?.trim() || !description?.trim()) return json({ error: 'title and description are required' }, 400)
      const sev = ['Low', 'Medium', 'High', 'Critical'].includes(severity) ? severity : 'Medium'

      const { data, error } = await sb.from('support_tickets').insert({
        id: uuidv4(),
        client_id: user.client_id || null,
        created_by: user.id,
        title: title.trim(),
        description: description.trim(),
        severity: sev,
        status: 'Open',
      }).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ ticket: data }, 201)
    }

    const supportDeleteMatch = route.match(/^\/support-tickets\/([^/]+)$/)
    if (supportDeleteMatch && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const ticketId = supportDeleteMatch[1]
      const moved = await moveToRecycleBin({ tableName: 'support_tickets', entityType: 'support_ticket', id: ticketId, user })
      if (!moved.ok) return json({ error: 'Ticket not found' }, 404)
      return json({ success: true })
    }

    const supportMatch = route.match(/^\/support-tickets\/([^/]+)$/)
    if (supportMatch && method === 'PATCH') {
      const user = await getUserFromRequest(request)
      if (!user || !INTERNAL_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const ticketId = supportMatch[1]
      const { status, resolution_note } = await request.json()
      const allowedStatus = ['Open', 'In Progress', 'Resolved', 'Closed']
      const update = {}
      if (status && allowedStatus.includes(status)) update.status = status
      if (resolution_note !== undefined) update.resolution_note = resolution_note?.trim() || null
      if (status === 'Resolved' || status === 'Closed') update.resolved_at = new Date().toISOString()
      update.updated_at = new Date().toISOString()
      const { data, error } = await sb.from('support_tickets').update(update).eq('id', ticketId).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ ticket: data })
    }

    // --- PROJECTS ---
    if (route === '/projects' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      let q = sb.from('projects').select('*').order('upload_timestamp', { ascending: false })
      if (user.role === CLIENT_ADMIN) q = q.eq('client_id', user.client_id)
      else if (user.role === ADMIN) q = q.eq('assigned_to', user.id)
      else if (user.role === CLIENT_USER) {
        const { data: assignments } = await sb.from('user_projects').select('project_id').eq('user_id', user.id)
        const ids = (assignments || []).map(a => a.project_id)
        if (ids.length === 0) return json({ projects: [] })
        q = q.in('id', ids)
      }
      const { data: projects } = await q
      const { data: clients } = await sb.from('clients').select('*')
      const { data: users } = await sb.from('users').select('id, username')
      const cmap = Object.fromEntries((clients || []).map(c => [c.id, c]))
      const umap = Object.fromEntries((users || []).map(u => [u.id, u]))
      const enriched = (projects || []).map(p => {
        const result = { ...p, client_name: cmap[p.client_id]?.name || 'Unknown' }
        if (!CLIENT_ROLES.includes(user.role)) result.assignee_name = umap[p.assigned_to]?.username || null
        return result
      })
      return json({ projects: enriched })
    }

    if (route === '/projects' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (user.role !== SUPER_ADMIN) return json({ error: 'Forbidden — only Super-Admin can create projects' }, 403)
      const body = await request.json()
      const clientId = CLIENT_ROLES.includes(user.role) ? user.client_id : body.client_id
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
      } else {
        const adminAssignee = await nextJobAdminAssignee()
        if (adminAssignee) assigned_to = adminAssignee.id
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
      } else if (assigned_to) {
        const { data: assignee } = await sb.from('users').select('username').eq('id', assigned_to).maybeSingle()
        await audit(project.id, user, `Assigned to ${assignee?.username} via round-robin.`)
      }
      return json({ project: data })
    }

    if (route.startsWith('/projects/') && route.endsWith('/status') && method === 'PATCH') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (CLIENT_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
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
      if (user.role === ADMIN) updateFields.assigned_to = user.id
      await sb.from('projects').update(updateFields).eq('id', id)
      await audit(id, user, `Status changed: ${p.status} → ${status}`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && route.endsWith('/issue-note') && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (CLIENT_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
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
      if (CLIENT_ROLES.includes(user.role) && p.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      if (p.status !== 'Delivery') return json({ error: 'project not in Delivery stage yet' }, 400)
      await sb.from('projects').update({ delivery_confirmed: true, delivery_confirmed_at: new Date().toISOString() }).eq('id', id)
      await audit(id, user, `Client confirmed delivery.`)
      return json({ success: true })
    }

    if (route.match(/^\/projects\/[^/]+$/) && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || user.role !== SUPER_ADMIN) return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const moved = await moveToRecycleBin({ tableName: 'projects', entityType: 'project', id, user })
      if (!moved.ok) return json({ error: 'Project not found' }, 404)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const { data: p } = await sb.from('projects').select('*').eq('id', id).maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      if (CLIENT_ROLES.includes(user.role) && p.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      const { data: logs } = await sb.from('audit_logs').select('*').eq('project_id', id).order('timestamp', { ascending: false })
      // Client-User sees audit logs as Job Card logs; Client-Admin does not
      const showLogs = !CLIENT_ROLES.includes(user.role) || user.role === CLIENT_USER
      return json({ project: p, audit_logs: showLogs ? (logs || []) : [] })
    }

    // --- AUDIT ---
    if (route === '/audit-logs' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || !INTERNAL_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const { data } = await sb.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
      return json({ logs: data || [] })
    }

    // --- ANALYTICS ---
    if (route === '/analytics' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || !INTERNAL_ROLES.includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const { data: projects } = await sb.from('projects').select('*')
      const { data: clientProjects } = await sb.from('client_projects').select('id, client_id')
      const { data: jobs } = await sb.from('jobs').select('id, created_at')
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

      for (const cp of (clientProjects || [])) {
        byClient[cp.client_id] = (byClient[cp.client_id] || 0) + 1
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
      for (const j of (jobs || [])) {
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

      return json({
        totals: {
          projects: (clientProjects || []).length,
          client_workspaces: (clientProjects || []).length,
          legacy_projects: (projects || []).length,
          field_jobs: (jobs || []).length,
          clients: (clients || []).length,
          users: (users || []).length,
          refly,
        },
        byStatus, bySla,
        fieldJobsByMonth,
        fieldJobsByWeek,
        byClient: (clients || []).map(c => ({ id: c.id, name: c.name, count: byClient[c.id] || 0 })),
      })
    }

    if (route === '/jobs-assigned' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || ![ADMIN, SUPER_ADMIN].includes(user.role)) return json({ error: 'Forbidden' }, 403)

      let q = sb.from('jobs').select('*').order('updated_at', { ascending: false })
      if (user.role === ADMIN) q = q.eq('assigned_to', user.id)
      const { data: jobs, error } = await q
      if (error) return json({ error: error.message }, 500)

      const projectIds = [...new Set((jobs || []).map(j => j.project_id))]
      const userIds = [...new Set((jobs || []).flatMap(j => [j.assigned_to, j.created_by]).filter(Boolean))]
      const { data: projects } = projectIds.length > 0
        ? await sb.from('client_projects').select('id, name, type, client_id').in('id', projectIds)
        : { data: [] }
      const { data: clients } = projects?.length
        ? await sb.from('clients').select('id, name').in('id', [...new Set(projects.map(p => p.client_id))])
        : { data: [] }
      const { data: people } = userIds.length > 0
        ? await sb.from('users').select('id, username').in('id', userIds)
        : { data: [] }
      const { data: commentRows } = (jobs || []).length > 0
        ? await sb.from('job_comments').select('*').in('job_id', jobs.map(j => j.id)).order('created_at', { ascending: false })
        : { data: [] }

      const pMap = Object.fromEntries((projects || []).map(p => [p.id, p]))
      const cMap = Object.fromEntries((clients || []).map(c => [c.id, c.name]))
      const uMap = Object.fromEntries((people || []).map(u => [u.id, u.username]))
      const commentsByJob = {}
      for (const c of (commentRows || [])) {
        if (!commentsByJob[c.job_id]) commentsByJob[c.job_id] = []
        commentsByJob[c.job_id].push(c)
      }

      return json({
        jobs: (jobs || []).map(j => {
          const p = pMap[j.project_id]
          const legacyStage = j.status === 'Blocked'
            ? 'Cancelled'
            : ((j.status === 'In Progress' || j.status === 'Done') ? j.status : 'Pending')
          return {
            ...j,
            sc_status: j.sc_status || legacyStage,
            uni_status: j.uni_status || legacyStage,
            project_name: p?.name || null,
            project_type: p?.type || null,
            client_name: p?.client_id ? (cMap[p.client_id] || null) : null,
            assigned_to_name: uMap[j.assigned_to] || null,
            created_by_name: uMap[j.created_by] || null,
            comments_log: commentsByJob[j.id] || [],
          }
        }),
      })
    }

    // --- CLIENT PROJECTS ---
    if (route === '/client-projects' && method === 'GET') {
      const user = await getUserFromRequest(request)
      if (!user || (![...CLIENT_ROLES, ...INTERNAL_ROLES].includes(user.role))) return json({ error: 'Forbidden' }, 403)

      let q = sb.from('client_projects').select('*').order('created_at', { ascending: false })
      if (CLIENT_ROLES.includes(user.role)) q = q.eq('client_id', user.client_id)

      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)

      const clientIds = [...new Set((data || []).map(p => p.client_id).filter(Boolean))]
      const { data: clients } = clientIds.length > 0
        ? await sb.from('clients').select('id, name').in('id', clientIds)
        : { data: [] }
      const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c.name]))

      return json({ projects: (data || []).map(p => ({ ...p, client_name: clientMap[p.client_id] || null })) })
    }

    if (route === '/client-projects' && method === 'POST') {
      const user = await getUserFromRequest(request)
      if (!user || ![CLIENT_ADMIN, ADMIN, SUPER_ADMIN].includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const body = await request.json()
      const { name, type, start_date, end_date, head, client_id } = body
      const clientId = user.role === CLIENT_ADMIN ? user.client_id : client_id
      if (!clientId) return json({ error: 'client_id is required' }, 400)
      if (!type || !start_date || !head) return json({ error: 'Project category and project admin are required' }, 400)
      const { data, error } = await sb.from('client_projects').insert({
        id: uuidv4(),
        client_id: clientId,
        name: (name || '').trim() || `${type} - ${head}`,
        type,
        start_date,
        end_date: end_date || null,
        head: head.trim(),
        created_by: user.id,
      }).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ project: data }, 201)
    }

    const clientProjectMatch = route.match(/^\/client-projects\/([^/]+)$/)
    if (clientProjectMatch && method === 'PATCH') {
      const user = await getUserFromRequest(request)
      if (!user || ![CLIENT_ADMIN, ADMIN, SUPER_ADMIN].includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const projectId = clientProjectMatch[1]
      const body = await request.json()

      let getQuery = sb.from('client_projects').select('*').eq('id', projectId)
      if (user.role === CLIENT_ADMIN) getQuery = getQuery.eq('client_id', user.client_id)
      const { data: existing } = await getQuery.maybeSingle()
      if (!existing) return json({ error: 'Project not found' }, 404)

      const update = {}
      if (body.name !== undefined) {
        const v = String(body.name || '').trim()
        update.name = v || `${existing.type} - ${existing.head}`
      }
      if (body.type !== undefined) {
        const v = String(body.type || '').trim()
        if (!v) return json({ error: 'type cannot be empty' }, 400)
        update.type = v
      }
      if (body.start_date !== undefined) {
        const v = String(body.start_date || '').trim()
        if (!v) return json({ error: 'start_date cannot be empty' }, 400)
        update.start_date = v
      }
      if (body.end_date !== undefined) {
        update.end_date = body.end_date || null
      }
      if (body.head !== undefined) {
        const v = String(body.head || '').trim()
        if (!v) return json({ error: 'head cannot be empty' }, 400)
        update.head = v
      }

      if (Object.keys(update).length === 0) return json({ error: 'No valid fields to update' }, 400)

      const { data, error } = await sb.from('client_projects')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ project: data })
    }

    if (clientProjectMatch && method === 'DELETE') {
      const user = await getUserFromRequest(request)
      if (!user || ![SUPER_ADMIN, CLIENT_ADMIN].includes(user.role)) return json({ error: 'Forbidden' }, 403)
      const projectId = clientProjectMatch[1]
      const scope = user.role === CLIENT_ADMIN ? { field: 'client_id', value: user.client_id } : null
      const moved = await moveToRecycleBin({ tableName: 'client_projects', entityType: 'client_project', id: projectId, user, scope })
      if (!moved.ok) return json({ error: 'Project not found' }, 404)
      return json({ success: true })
    }

    // --- JOBS ---
    const jobsMatch = route.match(/^\/client-projects\/([^/]+)\/jobs$/)
    if (jobsMatch) {
      const projectId = jobsMatch[1]
      const user = await getUserFromRequest(request)
      if (!user || (![...CLIENT_ROLES, ...INTERNAL_ROLES].includes(user.role))) return json({ error: 'Forbidden' }, 403)
      // verify project scope
      let projQuery = sb.from('client_projects').select('id').eq('id', projectId)
      if (CLIENT_ROLES.includes(user.role)) projQuery = projQuery.eq('client_id', user.client_id)
      const { data: proj } = await projQuery.single()
      if (!proj) return json({ error: 'Project not found' }, 404)

      if (method === 'GET') {
        const { data, error } = await sb
          .from('jobs')
          .select('*, assigned_user:assigned_to(username), creator:created_by(username)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        if (error) return json({ error: error.message }, 500)
        const jobIds = (data || []).map(j => j.id)
        const { data: commentRows } = jobIds.length > 0
          ? await sb.from('job_comments').select('*').in('job_id', jobIds).order('created_at', { ascending: false })
          : { data: [] }
        const commentsByJob = {}
        for (const c of (commentRows || [])) {
          if (!commentsByJob[c.job_id]) commentsByJob[c.job_id] = []
          commentsByJob[c.job_id].push(c)
        }
        const jobs = (data || []).map(j => ({
          ...j,
          sc_status: j.sc_status || (j.status === 'Blocked' ? 'Cancelled' : (j.status === 'Open' ? 'Pending' : j.status)),
          uni_status: j.uni_status || (j.status === 'Blocked' ? 'Cancelled' : (j.status === 'Open' ? 'Pending' : j.status)),
          assigned_to_name: j.assigned_user?.username || null,
          created_by_name: j.creator?.username || null,
          comments_log: commentsByJob[j.id] || [],
        }))
        return json({ jobs })
      }

      if (method === 'POST') {
        const body = await request.json()
        const { title, capture_date, drone_name, category, flight_count, flights, has_logs, comments, assigned_to } = body
        if (!title?.trim()) return json({ error: 'Title required' }, 400)
        if (!capture_date)   return json({ error: 'Capture date required' }, 400)
        if (!drone_name?.trim()) return json({ error: 'Drone name required' }, 400)
        if (!comments?.trim()) return json({ error: 'Comments are required' }, 400)
        const VALID_CATS = ['Stand Count', 'Uniformity']
        if (category && !VALID_CATS.includes(category)) return json({ error: 'Invalid category' }, 400)
        if (!flight_count || parseInt(flight_count, 10) < 1) return json({ error: 'Flight count required' }, 400)
        if (!Array.isArray(flights) || flights.length < 1) return json({ error: 'Flight data required' }, 400)
        const invalidFlight = flights.some(f => f?.image_count === null || f?.image_count === undefined || f?.csv_rows === null || f?.csv_rows === undefined)
        if (invalidFlight) return json({ error: 'Each flight requires image count and CSV rows' }, 400)
        let assigneeId = null

        if (CLIENT_ROLES.includes(user.role)) {
          // Client-created jobs always auto-assign to Admins in round-robin order.
          const rrAdmin = await nextJobAdminAssignee()
          assigneeId = rrAdmin?.id || null
        } else {
          if (assigned_to) {
            assigneeId = assigned_to
          } else {
            const rrAdmin = await nextJobAdminAssignee()
            assigneeId = rrAdmin?.id || null
          }
        }

        if (assigneeId) {
          const { data: assignee, error: assigneeErr } = await sb.from('users').select('id').eq('id', assigneeId).eq('role', ADMIN).maybeSingle()
          if (assigneeErr || !assignee) return json({ error: 'assigned_to must be an Admin user' }, 400)
        }

        const { data, error } = await sb.from('jobs').insert({
          id: uuidv4(),
          project_id: projectId,
          title: title.trim(),
          capture_date: capture_date,
          drone_name: drone_name.trim(),
          category: VALID_CATS.includes(category) ? category : 'Stand Count',
          flight_count: flight_count || 1,
          flights: Array.isArray(flights) ? flights : [],
          has_logs: has_logs === true,
          comments: comments?.trim() || null,
          assigned_to: assigneeId,
          status: 'Open',
          created_by: user.id,
        }).select().single()
        if (error) return json({ error: error.message }, 500)
        await addJobComment(data.id, user, 'Job card created', 'Created')
        if (comments?.trim()) await addJobComment(data.id, user, comments.trim(), 'Created')
        return json({ job: data }, 201)
      }
    }

    const jobCommentMatch = route.match(/^\/client-projects\/([^/]+)\/jobs\/([^/]+)\/comments$/)
    if (jobCommentMatch && method === 'POST') {
      const [, projectId, jobId] = jobCommentMatch
      const user = await getUserFromRequest(request)
      if (!user || (![...CLIENT_ROLES, ...INTERNAL_ROLES].includes(user.role))) return json({ error: 'Forbidden' }, 403)
      let projQuery = sb.from('client_projects').select('id').eq('id', projectId)
      if (CLIENT_ROLES.includes(user.role)) projQuery = projQuery.eq('client_id', user.client_id)
      const { data: proj } = await projQuery.single()
      if (!proj) return json({ error: 'Project not found' }, 404)

      const { comment, stage } = await request.json()
      if (!comment?.trim()) return json({ error: 'comment required' }, 400)
      await addJobComment(jobId, user, comment.trim(), stage || 'General')
      return json({ ok: true })
    }

    const jobMatch = route.match(/^\/client-projects\/([^/]+)\/jobs\/([^/]+)$/)
    if (jobMatch) {
      const [, projectId, jobId] = jobMatch
      const user = await getUserFromRequest(request)
      if (!user || (![...CLIENT_ROLES, ...INTERNAL_ROLES].includes(user.role))) return json({ error: 'Forbidden' }, 403)
      let projQuery = sb.from('client_projects').select('id').eq('id', projectId)
      if (CLIENT_ROLES.includes(user.role)) projQuery = projQuery.eq('client_id', user.client_id)
      const { data: proj } = await projQuery.single()
      if (!proj) return json({ error: 'Project not found' }, 404)

      if (method === 'PATCH') {
        const body = await request.json()
        const { data: currentJob } = await sb.from('jobs').select('*').eq('id', jobId).eq('project_id', projectId).maybeSingle()
        if (!currentJob) return json({ error: 'Job not found' }, 404)
        const allowed = {}
        const STAGE_VALS = ['Pending', 'In Progress', 'Done', 'Blocked', 'Cancelled']
        const hasScStatus = Object.prototype.hasOwnProperty.call(currentJob, 'sc_status')
        const hasUniStatus = Object.prototype.hasOwnProperty.call(currentJob, 'uni_status')
        const toDbStage = (stage) => (stage === 'Cancelled' ? 'Blocked' : stage)
        const statusFromStage = (stage) => {
          if (stage === 'Pending') return 'Open'
          if (stage === 'Cancelled') return 'Blocked'
          return stage
        }
        if (body.status && ['Open', 'In Progress', 'Done', 'Blocked'].includes(body.status)) allowed.status = body.status
        if (body.sc_status && STAGE_VALS.includes(body.sc_status)) {
          if (hasScStatus) allowed.sc_status = toDbStage(body.sc_status)
          allowed.status = statusFromStage(body.sc_status)
        }
        if (body.uni_status && STAGE_VALS.includes(body.uni_status)) {
          if (hasUniStatus) allowed.uni_status = toDbStage(body.uni_status)
          allowed.status = statusFromStage(body.uni_status)
        }
        if (body.title)                     allowed.title       = body.title.trim()
        if (body.comments !== undefined)    allowed.comments    = body.comments?.trim() || null
        if (body.has_logs  !== undefined)   allowed.has_logs    = body.has_logs === true
        if (body.assigned_to !== undefined) {
          if (![ADMIN, SUPER_ADMIN].includes(user.role)) return json({ error: 'Only Admin can reassign jobs' }, 403)
          if (body.assigned_to) {
            const { data: assignee } = await sb.from('users').select('id').eq('id', body.assigned_to).eq('role', ADMIN).maybeSingle()
            if (!assignee) return json({ error: 'assigned_to must be an Admin user' }, 400)
            allowed.assigned_to = body.assigned_to
          } else {
            allowed.assigned_to = null
          }
        }
        if (body.category && ['Stand Count', 'Uniformity'].includes(body.category)) allowed.category = body.category
        const { data, error } = await sb.from('jobs').update({ ...allowed, updated_at: new Date().toISOString() }).eq('id', jobId).eq('project_id', projectId).select().single()
        if (error) return json({ error: error.message }, 500)

        if (allowed.status && allowed.status !== currentJob.status) {
          await addJobComment(jobId, user, `Overall status changed: ${currentJob.status || 'Open'} -> ${allowed.status}`, 'Status')
        }
        if (allowed.sc_status && allowed.sc_status !== currentJob.sc_status) {
          await addJobComment(jobId, user, `Stand Count stage: ${currentJob.sc_status || 'Pending'} -> ${allowed.sc_status}`, 'Stand Count')
        }
        if (allowed.uni_status && allowed.uni_status !== currentJob.uni_status) {
          await addJobComment(jobId, user, `Uniformity stage: ${currentJob.uni_status || 'Pending'} -> ${allowed.uni_status}`, 'Uniformity')
        }
        if (body.pipeline_comment?.trim()) {
          await addJobComment(jobId, user, body.pipeline_comment.trim(), body.pipeline_stage || 'General')
        }

        return json({ job: data })
      }

      if (method === 'DELETE') {
        if (![CLIENT_ADMIN, SUPER_ADMIN].includes(user.role)) return json({ error: 'Forbidden' }, 403)
        const moved = await moveToRecycleBin({
          tableName: 'jobs',
          entityType: 'job',
          id: jobId,
          user,
          scope: { field: 'project_id', value: projectId },
        })
        if (!moved.ok) return json({ error: 'Job not found' }, 404)
        return json({ ok: true })
      }
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
