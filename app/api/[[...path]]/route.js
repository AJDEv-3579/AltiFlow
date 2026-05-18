import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// ---------- MongoDB ----------
let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
    await ensureSeed(db)
  }
  return db
}

const JWT_SECRET = process.env.JWT_SECRET || 'altiflow_dev_secret'
const DEFAULT_TEAM_PWD = 'WelcometoAlti@123'

// ---------- Seeding ----------
let seedDone = false
async function ensureSeed(db) {
  if (seedDone) return
  seedDone = true
  const usersCol = db.collection('users')
  const clientsCol = db.collection('clients')
  const stateCol = db.collection('system_state')

  // Super Admin
  const admin = await usersCol.findOne({ username: 'devbond01' })
  if (!admin) {
    await usersCol.insertOne({
      id: uuidv4(),
      username: 'devbond01',
      password_hash: await bcrypt.hash('63pk0wpT@123', 10),
      role: 'Admin',
      client_id: null,
      must_change_password: false,
      created_at: new Date(),
    })
  }

  // Seed Bayer client
  let bayer = await clientsCol.findOne({ name: 'Bayer' })
  if (!bayer) {
    bayer = {
      id: uuidv4(),
      name: 'Bayer',
      logo_url: '',
      created_at: new Date(),
    }
    await clientsCol.insertOne(bayer)
  }

  // Seed bayer client user
  const bayerUser = await usersCol.findOne({ username: 'bayer' })
  if (!bayerUser) {
    await usersCol.insertOne({
      id: uuidv4(),
      username: 'bayer',
      password_hash: await bcrypt.hash(DEFAULT_TEAM_PWD, 10),
      role: 'Client',
      client_id: bayer.id,
      must_change_password: true,
      created_at: new Date(),
    })
  }

  // Team members
  const team = ['Rohit', 'Shalini', 'Advik']
  for (const name of team) {
    const exists = await usersCol.findOne({ username: name })
    if (!exists) {
      await usersCol.insertOne({
        id: uuidv4(),
        username: name,
        password_hash: await bcrypt.hash(DEFAULT_TEAM_PWD, 10),
        role: 'Team',
        client_id: null,
        must_change_password: true,
        created_at: new Date(),
      })
    }
  }

  // Round-robin state
  const rrState = await stateCol.findOne({ key: 'refly_rr_index' })
  if (!rrState) {
    await stateCol.insertOne({ key: 'refly_rr_index', value: 0 })
  }
}

// ---------- Helpers ----------
function corsify(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

function json(data, status = 200) {
  return corsify(NextResponse.json(data, { status }))
}

function strip(doc) {
  if (!doc) return doc
  const { _id, password_hash, ...rest } = doc
  return rest
}

async function getUserFromRequest(request, db) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await db.collection('users').findOne({ id: decoded.sub })
    return user || null
  } catch (e) {
    return null
  }
}

// ---------- SLA Engine ----------
async function calculateSlaDeadline(db, clientId, uploadTs) {
  const startOfDay = new Date(uploadTs)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(uploadTs)
  endOfDay.setHours(23, 59, 59, 999)

  // Count projects already uploaded today by this client (including the new one we're about to insert -> so we'll +1)
  const todayCount = await db.collection('projects').countDocuments({
    client_id: clientId,
    upload_timestamp: { $gte: startOfDay, $lte: endOfDay },
  })
  const total = todayCount + 1
  let hours = 24
  if (total >= 3 && total <= 4) hours = 48
  else if (total > 4) hours = 72

  const deadline = new Date(uploadTs.getTime() + hours * 60 * 60 * 1000)
  return { deadline, hours, dailyCount: total }
}

// ---------- Round Robin ----------
async function nextReflyAssignee(db) {
  const order = ['Rohit', 'Shalini', 'Advik']
  const stateCol = db.collection('system_state')
  const state = await stateCol.findOneAndUpdate(
    { key: 'refly_rr_index' },
    { $inc: { value: 1 } },
    { returnDocument: 'before', upsert: true }
  )
  const idx = (state?.value ?? 0) % order.length
  const username = order[idx]
  const user = await db.collection('users').findOne({ username })
  return user
}

// ---------- Audit ----------
async function audit(db, projectId, user, desc) {
  await db.collection('audit_logs').insertOne({
    id: uuidv4(),
    project_id: projectId,
    user_id: user?.id || null,
    username: user?.username || 'system',
    action_desc: desc,
    timestamp: new Date(),
  })
}

// ---------- Router ----------
export async function OPTIONS() {
  return corsify(new NextResponse(null, { status: 200 }))
}

async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // ----- Health -----
    if ((route === '/root' || route === '/') && method === 'GET') {
      return json({ message: 'Altiflow API online', service: 'altiflow' })
    }

    // ----- AUTH -----
    if (route === '/auth/login' && method === 'POST') {
      const { username, password } = await request.json()
      if (!username || !password) return json({ error: 'username & password required' }, 400)
      const user = await db.collection('users').findOne({ username: { $regex: `^${username}$`, $options: 'i' } })
      if (!user) return json({ error: 'Invalid credentials' }, 401)
      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) return json({ error: 'Invalid credentials' }, 401)

      const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
      let clientData = null
      if (user.client_id) {
        clientData = await db.collection('clients').findOne({ id: user.client_id })
      }
      return json({ token, user: { ...strip(user), client: strip(clientData) } })
    }

    if (route === '/auth/me' && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      let clientData = null
      if (user.client_id) {
        clientData = await db.collection('clients').findOne({ id: user.client_id })
      }
      return json({ user: { ...strip(user), client: strip(clientData) } })
    }

    if (route === '/auth/change-password' && method === 'POST') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const { current_password, new_password } = await request.json()
      if (!new_password || new_password.length < 6) return json({ error: 'New password must be 6+ chars' }, 400)
      const ok = await bcrypt.compare(current_password || '', user.password_hash)
      if (!ok) return json({ error: 'Current password incorrect' }, 401)
      await db.collection('users').updateOne(
        { id: user.id },
        { $set: { password_hash: await bcrypt.hash(new_password, 10), must_change_password: false } }
      )
      return json({ success: true })
    }

    // ----- CLIENTS (Admin) -----
    if (route === '/clients' && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const items = await db.collection('clients').find({}).sort({ created_at: -1 }).toArray()
      return json({ clients: items.map(strip) })
    }

    if (route === '/clients' && method === 'POST') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { name, logo_url } = await request.json()
      if (!name) return json({ error: 'name required' }, 400)
      const c = { id: uuidv4(), name, logo_url: logo_url || '', created_at: new Date() }
      await db.collection('clients').insertOne(c)
      return json({ client: strip(c) })
    }

    if (route.startsWith('/clients/') && method === 'DELETE') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      await db.collection('clients').deleteOne({ id })
      return json({ success: true })
    }

    // ----- USERS (Admin) -----
    if (route === '/users' && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const items = await db.collection('users').find({}).sort({ created_at: -1 }).toArray()
      const clients = await db.collection('clients').find({}).toArray()
      const cmap = Object.fromEntries(clients.map(c => [c.id, c.name]))
      return json({ users: items.map(u => ({ ...strip(u), client_name: cmap[u.client_id] || null })) })
    }

    if (route === '/users' && method === 'POST') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const { username, role, client_id, password } = await request.json()
      if (!username || !role) return json({ error: 'username & role required' }, 400)
      const exists = await db.collection('users').findOne({ username: { $regex: `^${username}$`, $options: 'i' } })
      if (exists) return json({ error: 'Username already exists' }, 409)
      const pwd = password || DEFAULT_TEAM_PWD
      const u = {
        id: uuidv4(),
        username,
        password_hash: await bcrypt.hash(pwd, 10),
        role,
        client_id: role === 'Client' ? (client_id || null) : null,
        must_change_password: true,
        created_at: new Date(),
      }
      await db.collection('users').insertOne(u)
      return json({ user: strip(u), default_password: pwd })
    }

    if (route.startsWith('/users/') && method === 'DELETE') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const target = await db.collection('users').findOne({ id })
      if (target?.username === 'devbond01') return json({ error: 'Cannot delete super admin' }, 400)
      await db.collection('users').deleteOne({ id })
      return json({ success: true })
    }

    // ----- PROJECTS -----
    if (route === '/projects' && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      let query = {}
      if (user.role === 'Client') {
        query.client_id = user.client_id
      }
      const projects = await db.collection('projects').find(query).sort({ upload_timestamp: -1 }).toArray()
      const clients = await db.collection('clients').find({}).toArray()
      const users = await db.collection('users').find({}).toArray()
      const cmap = Object.fromEntries(clients.map(c => [c.id, c]))
      const umap = Object.fromEntries(users.map(u => [u.id, u]))

      const enriched = projects.map(p => {
        const base = strip(p)
        const result = {
          ...base,
          client_name: cmap[p.client_id]?.name || 'Unknown',
        }
        // Client view: hide internal assignee data
        if (user.role !== 'Client') {
          result.assignee_name = umap[p.assigned_to]?.username || null
        }
        return result
      })
      return json({ projects: enriched })
    }

    if (route === '/projects' && method === 'POST') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      // Allow client (their own) and admin (specify client_id)
      const body = await request.json()
      const clientId = user.role === 'Client' ? user.client_id : (body.client_id)
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

      // SERVER-LOCKED upload timestamp
      const upload_timestamp = new Date()

      // SLA
      const { deadline, hours, dailyCount } = await calculateSlaDeadline(db, clientId, upload_timestamp)

      // Refly check
      let status = 'Pending'
      let assigned_to = null
      let refly_reason = null
      if ((image_count - csv_count) > 10 && !base_rover_bool) {
        status = 'Failed_Refly'
        const assignee = await nextReflyAssignee(db)
        if (assignee) assigned_to = assignee.id
        refly_reason = `Image-CSV mismatch (${image_count - csv_count}) without Base/Rover correction.`
      }

      const project = {
        id: uuidv4(),
        client_id: clientId,
        title,
        drone_name,
        capture_date,
        upload_timestamp,
        image_count,
        csv_count,
        base_rover_bool,
        grid_file_bool,
        status,
        assigned_to,
        sla_deadline: deadline,
        sla_hours: hours,
        sla_daily_count: dailyCount,
        refly_reason,
        issue_note: null,
        issue_photo: null,
        refly_resolved: false,
        created_at: new Date(),
      }
      await db.collection('projects').insertOne(project)
      await audit(db, project.id, user, `Project created with status "${status}". SLA: ${hours}h (daily upload #${dailyCount}).`)
      if (status === 'Failed_Refly' && assigned_to) {
        const assignee = await db.collection('users').findOne({ id: assigned_to })
        await audit(db, project.id, user, `Auto-flagged as Failed_Refly and assigned (round-robin) to ${assignee?.username}.`)
      }
      return json({ project: strip(project) })
    }

    if (route.startsWith('/projects/') && route.endsWith('/status') && method === 'PATCH') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (user.role === 'Client') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { status } = await request.json()
      const allowed = ['Pending', 'In-Download', 'QC', 'Processing', 'Delivery', 'Failed_Refly']
      if (!allowed.includes(status)) return json({ error: 'invalid status' }, 400)

      const p = await db.collection('projects').findOne({ id })
      if (!p) return json({ error: 'project not found' }, 404)
      if (p.status === 'Failed_Refly' && !p.refly_resolved) {
        return json({ error: 'Card is locked. Resolve Refly with an issue note + photo first.' }, 423)
      }
      const old = p.status
      await db.collection('projects').updateOne(
        { id },
        { $set: { status, assigned_to: user.role === 'Team' ? user.id : p.assigned_to } }
      )
      await audit(db, id, user, `Status changed: ${old} → ${status}`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && route.endsWith('/issue-note') && method === 'POST') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      if (user.role === 'Client') return json({ error: 'Forbidden' }, 403)
      const id = route.split('/')[2]
      const { note, photo_data_url } = await request.json()
      if (!note || !photo_data_url) return json({ error: 'note & photo required' }, 400)
      const p = await db.collection('projects').findOne({ id })
      if (!p) return json({ error: 'not found' }, 404)
      await db.collection('projects').updateOne(
        { id },
        { $set: { issue_note: note, issue_photo: photo_data_url, refly_resolved: true, status: 'Pending' } }
      )
      await audit(db, id, user, `Refly resolved: issue note + corrective photo uploaded by ${user.username}. Card unlocked → Pending.`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && route.endsWith('/confirm-delivery') && method === 'POST') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const p = await db.collection('projects').findOne({ id })
      if (!p) return json({ error: 'not found' }, 404)
      if (user.role === 'Client' && p.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      if (p.status !== 'Delivery') return json({ error: 'project not in Delivery stage yet' }, 400)
      await db.collection('projects').updateOne({ id }, { $set: { delivery_confirmed: true, delivery_confirmed_at: new Date() } })
      await audit(db, id, user, `Client confirmed delivery.`)
      return json({ success: true })
    }

    if (route.startsWith('/projects/') && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const id = route.split('/')[2]
      const p = await db.collection('projects').findOne({ id })
      if (!p) return json({ error: 'not found' }, 404)
      if (user.role === 'Client' && p.client_id !== user.client_id) return json({ error: 'Forbidden' }, 403)
      const logs = await db.collection('audit_logs').find({ project_id: id }).sort({ timestamp: -1 }).toArray()
      return json({
        project: strip(p),
        audit_logs: user.role === 'Client' ? [] : logs.map(strip),
      })
    }

    // ----- AUDIT LOGS -----
    if (route === '/audit-logs' && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const logs = await db.collection('audit_logs').find({}).sort({ timestamp: -1 }).limit(200).toArray()
      return json({ logs: logs.map(strip) })
    }

    // ----- ANALYTICS -----
    if (route === '/analytics' && method === 'GET') {
      const user = await getUserFromRequest(request, db)
      if (!user || user.role !== 'Admin') return json({ error: 'Forbidden' }, 403)
      const projects = await db.collection('projects').find({}).toArray()
      const clients = await db.collection('clients').find({}).toArray()
      const users = await db.collection('users').find({}).toArray()
      const now = Date.now()
      const byStatus = {}
      const bySla = { ok: 0, warning: 0, breached: 0 }
      const byClient = {}
      let refly = 0
      for (const p of projects) {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1
        if (p.status === 'Failed_Refly') refly++
        byClient[p.client_id] = (byClient[p.client_id] || 0) + 1
        const left = new Date(p.sla_deadline).getTime() - now
        if (left < 0) bySla.breached++
        else if (left < 4 * 3600 * 1000) bySla.warning++
        else bySla.ok++
      }
      return json({
        totals: {
          projects: projects.length,
          clients: clients.length,
          users: users.length,
          refly,
        },
        byStatus,
        bySla,
        byClient: clients.map(c => ({ id: c.id, name: c.name, count: byClient[c.id] || 0 })),
      })
    }

    // Not found
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
