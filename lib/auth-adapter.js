/**
 * lib/auth-adapter.js
 * ====================
 * Authentication Abstraction Layer for Altiflow
 *
 * DESIGN PHILOSOPHY:
 * ------------------
 * This module decouples the application from any specific auth implementation.
 * The feature flag SUPABASE_AUTH_ENABLED controls which strategy is active:
 *
 *   SUPABASE_AUTH_ENABLED=false (default):
 *     All auth uses the existing custom bcrypt+JWT system. Zero behavior change.
 *
 *   SUPABASE_AUTH_ENABLED=true (future — after migration is confirmed working):
 *     Supabase Auth is the primary strategy.
 *     Falls back to custom auth for users not yet migrated (auth_provider='custom').
 *
 * MIGRATION READINESS:
 * --------------------
 * Switching from custom to Supabase Auth requires only:
 *   1. Running the SQL migration (supabase/migrations/add_supabase_auth_columns.sql)
 *   2. Calling POST /api/admin/auth-migration/migrate-all
 *   3. Setting SUPABASE_AUTH_ENABLED=true in .env.local
 *   4. Restarting the Next.js server
 *
 * NO CODE CHANGES are needed in route.js or anywhere else.
 */

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin as sb, supabaseAuthAdmin } from '@/lib/supabase'

// ─── Feature Flag ─────────────────────────────────────────────────────────────
const SUPABASE_AUTH_ENABLED = process.env.SUPABASE_AUTH_ENABLED === 'true'
const JWT_SECRET = process.env.JWT_SECRET || 'altiflow_dev_secret'

// ─── Role Constants (mirrors route.js) ───────────────────────────────────────
export const SUPER_ADMIN = 'Super-Admin'
export const ADMIN = 'Admin'
export const CLIENT_ADMIN = 'Client-Admin'
export const CLIENT_USER = 'Client-User'
export const INTERNAL_ROLES = [SUPER_ADMIN, ADMIN]
export const CLIENT_ROLES = [CLIENT_ADMIN, CLIENT_USER]

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Check if the users table has an email column.
 * Cached after the first successful check.
 */
let _hasEmailColumn = null
async function hasEmailColumn() {
  if (_hasEmailColumn !== null) return _hasEmailColumn
  const { error } = await sb.from('users').select('id, email').limit(1)
  _hasEmailColumn = !error
  return _hasEmailColumn
}

/**
 * Check if the supabase_auth_id column exists on users table.
 * This column is added by the migration SQL.
 * Only caches a positive (true) result — never caches false.
 * This ensures the check self-heals after the migration SQL is run
 * without requiring a server restart.
 */
let _hasAuthColumns = null
async function hasSupabaseAuthColumns() {
  if (_hasAuthColumns === true) return true  // Only cache success, not failure
  const { error } = await sb.from('users').select('id, supabase_auth_id, auth_provider').limit(1)
  if (!error) _hasAuthColumns = true
  return !error
}

/**
 * Strip sensitive fields from a user record before returning to callers.
 */
export function stripSensitiveFields(user) {
  if (!user) return user
  const { password_hash, passcode_key_hash, ...rest } = user
  return rest
}

/**
 * Issue an Altiflow JWT for a user record.
 * The JWT is the app's session token — same format as before.
 */
export function issueAppToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

/**
 * Fetch client data for a user if they belong to a client org.
 */
async function fetchClientData(clientId) {
  if (!clientId) return null
  const { data } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle()
  return data
}

/**
 * Look up a user from the public.users table by username or email.
 */
async function findUserByIdentifier(identifier) {
  const clean = identifier.trim()
  if (await hasEmailColumn()) {
    const { data } = await sb
      .from('users')
      .select('*')
      .or(`username.ilike.${clean},email.ilike.${clean}`)
      .maybeSingle()
    return data
  }
  const { data } = await sb.from('users').select('*').ilike('username', clean).maybeSingle()
  return data
}

// ─── Custom Auth Strategy (existing system — always available) ─────────────────

/**
 * Authenticate using bcrypt password hash in public.users.
 * This is the original authentication logic, unchanged.
 *
 * @param {string} identifier - username or email
 * @param {string} password - plaintext password
 * @returns {{ user: object, token: string, client: object|null }}
 */
async function authenticateWithCustomAuth(identifier, password) {
  const user = await findUserByIdentifier(identifier)
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 })

  const passwordOk = await bcrypt.compare(password, user.password_hash)
  if (!passwordOk) throw Object.assign(new Error('Invalid credentials'), { status: 401 })

  const token = issueAppToken(user)
  const client = await fetchClientData(user.client_id)

  return { user: stripSensitiveFields(user), token, client }
}

// ─── Supabase Auth Strategy (active when SUPABASE_AUTH_ENABLED=true) ──────────

/**
 * Authenticate using Supabase Auth.
 * Only applies to users whose auth_provider='supabase'.
 * Falls back to custom auth for users not yet migrated.
 *
 * IMPORTANT: We do NOT use Supabase Auth JWTs for app sessions — we still
 * issue our own app JWT. This keeps the session format consistent during
 * and after migration.
 *
 * @param {string} identifier - email (Supabase Auth requires email)
 * @param {string} password - plaintext password
 * @returns {{ user: object, token: string, client: object|null }}
 */
async function authenticateWithSupabaseAuth(identifier, password) {
  // First, look up the user in public.users
  const user = await findUserByIdentifier(identifier)
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 })

  // If this user is not yet migrated to Supabase Auth, fall back to custom auth
  if (!user.auth_provider || user.auth_provider === 'custom' || !user.supabase_auth_id) {
    console.log(`[AuthAdapter] User ${user.username} not yet on Supabase Auth — using custom auth fallback`)
    return authenticateWithCustomAuth(identifier, password)
  }

  // User is on Supabase Auth — verify via Supabase
  // We need their email for Supabase Auth signIn
  const email = user.email
  if (!email) {
    // No email — cannot use Supabase Auth, fall back
    console.warn(`[AuthAdapter] User ${user.username} has auth_provider='supabase' but no email — falling back`)
    return authenticateWithCustomAuth(identifier, password)
  }

  const { data: authData, error: authError } = await supabaseAuthAdmin.signInWithPassword({
    email,
    password,
  }).catch(() => ({ data: null, error: new Error('Supabase Auth unavailable') }))

  if (authError || !authData?.user) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 })
  }

  // Issue Altiflow app JWT (not the Supabase JWT)
  const token = issueAppToken(user)
  const client = await fetchClientData(user.client_id)

  return { user: stripSensitiveFields(user), token, client }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * PRIMARY ENTRY POINT: Authenticate a user login attempt.
 *
 * Routes to the correct auth strategy based on SUPABASE_AUTH_ENABLED flag.
 * When flag is false: 100% custom auth — no behavioral change.
 * When flag is true: Supabase Auth primary, custom auth fallback.
 *
 * @param {string} identifier - username or email
 * @param {string} password - plaintext password
 * @returns {{ user: object, token: string, client: object|null }}
 */
export async function authenticateUser(identifier, password) {
  if (SUPABASE_AUTH_ENABLED) {
    return authenticateWithSupabaseAuth(identifier, password)
  }
  return authenticateWithCustomAuth(identifier, password)
}

/**
 * Get a user record from a Bearer token in a request's Authorization header.
 * Decodes the app JWT and fetches the user from public.users.
 * Unchanged from original getUserFromRequest — same JWT format.
 *
 * @param {Request} request - Next.js request object
 * @returns {object|null} user record or null if unauthenticated
 */
export async function getUserFromRequest(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const { data } = await sb.from('users').select('*').eq('id', decoded.sub).maybeSingle()
    return data
  } catch {
    return null
  }
}

/**
 * Create a new application user in public.users.
 * Optionally creates a corresponding Supabase Auth account when
 * SUPABASE_AUTH_ENABLED=true and the user has an email address.
 *
 * @param {object} opts
 * @param {string} opts.id - UUID for the new user
 * @param {string} opts.username - unique username
 * @param {string|null} opts.email - optional email
 * @param {string} opts.password - plaintext password (will be hashed)
 * @param {string} opts.role - one of the defined roles
 * @param {string|null} opts.client_id - client org ID (for client roles)
 * @param {boolean} opts.must_change_password - whether user must change pwd on first login
 * @returns {object} the created user record (sensitive fields stripped)
 */
export async function createAppUser({ id, username, email, password, role, client_id, must_change_password = true }) {
  const hasAuthCols = await hasSupabaseAuthColumns()

  const newUser = {
    id: id || uuidv4(),
    username,
    password_hash: await bcrypt.hash(password, 10),
    role,
    client_id: client_id || null,
    must_change_password,
  }

  if (await hasEmailColumn()) {
    newUser.email = email || null
  }

  // Set auth tracking columns if migration SQL has been run
  if (hasAuthCols) {
    newUser.auth_provider = 'custom'
    newUser.supabase_auth_id = null
  }

  const { data, error } = await sb.from('users').insert(newUser).select().single()
  if (error) throw new Error(error.message)

  // If Supabase Auth is enabled and user has an email, create auth account in parallel
  if (SUPABASE_AUTH_ENABLED && email && hasAuthCols) {
    try {
      await linkUserToSupabaseAuth(data.id, { suppressErrors: true })
    } catch (e) {
      // Non-fatal: user is created in custom auth — Supabase Auth can be linked later
      console.warn(`[AuthAdapter] Could not create Supabase Auth account for ${username}:`, e.message)
    }
  }

  return { user: stripSensitiveFields(data), default_password: password }
}

/**
 * Link an existing custom-auth user to Supabase Auth.
 * Creates a Supabase Auth account with email_confirm=true (no email sent).
 * Updates public.users.supabase_auth_id and auth_provider.
 * Logs the result to auth_migration_log.
 *
 * Requires: supabase/migrations/add_supabase_auth_columns.sql to have been run.
 *
 * @param {string} userId - UUID from public.users
 * @param {object} opts
 * @param {boolean} opts.suppressErrors - if true, log failure instead of throwing
 * @param {boolean} opts.sendInvite - if true, send password reset email after linking
 * @returns {{ ok: boolean, supabase_auth_id?: string, error?: string }}
 */
export async function linkUserToSupabaseAuth(userId, { suppressErrors = false, sendInvite = false } = {}) {
  // Fetch user
  const { data: user, error: fetchErr } = await sb
    .from('users')
    .select('id, username, email, auth_provider, supabase_auth_id')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr || !user) {
    const msg = 'User not found'
    if (suppressErrors) return { ok: false, error: msg }
    throw new Error(msg)
  }

  // Already migrated
  if (user.supabase_auth_id) {
    return { ok: true, supabase_auth_id: user.supabase_auth_id, already_migrated: true }
  }

  // Must have email to link to Supabase Auth
  if (!user.email) {
    const msg = `User ${user.username} has no email — cannot link to Supabase Auth`
    await logMigration(userId, null, 'skipped', msg)
    if (suppressErrors) return { ok: false, error: msg }
    throw new Error(msg)
  }

  try {
    // Create auth.users record without sending a confirmation email.
    // email_confirm=true means we mark email as confirmed immediately.
    // The user's actual password in Supabase Auth will be set when they
    // click the password reset link sent during Phase 2.
    const { data: authUser, error: createErr } = await supabaseAuthAdmin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: {
        altiflow_user_id: userId,
        altiflow_username: user.username,
        altiflow_role: user.role,
      },
    })

    if (createErr) {
      // If user already exists in Supabase Auth, look them up
      if (createErr.message?.includes('already been registered') || createErr.status === 422) {
        const { data: existing } = await supabaseAuthAdmin.listUsers()
        const existingUser = existing?.users?.find(u => u.email === user.email)
        if (existingUser) {
          await updateUserAuthLink(userId, existingUser.id)
          await logMigration(userId, existingUser.id, 'migrated', null)
          return { ok: true, supabase_auth_id: existingUser.id }
        }
      }
      throw new Error(createErr.message)
    }

    const supabaseAuthId = authUser.user.id

    // Update public.users record
    await updateUserAuthLink(userId, supabaseAuthId)
    await logMigration(userId, supabaseAuthId, 'migrated', null)

    // Optionally send password reset / invite email
    if (sendInvite && user.email) {
      try {
        await supabaseAuthAdmin.generateLink({
          type: 'recovery',
          email: user.email,
        })
        await sb.from('auth_migration_log')
          .update({ status: 'invited', invite_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'migrated')
      } catch (inviteErr) {
        console.warn(`[AuthAdapter] Could not send invite email to ${user.email}:`, inviteErr.message)
      }
    }

    return { ok: true, supabase_auth_id: supabaseAuthId }
  } catch (e) {
    await logMigration(userId, null, 'failed', e.message)
    if (suppressErrors) return { ok: false, error: e.message }
    throw e
  }
}

async function updateUserAuthLink(userId, supabaseAuthId) {
  await sb.from('users').update({
    supabase_auth_id: supabaseAuthId,
    auth_provider: 'supabase',
  }).eq('id', userId)
}

async function logMigration(userId, supabaseAuthId, status, errorMessage) {
  const now = new Date().toISOString()
  // Upsert by user_id — one log entry per user
  const { data: existing } = await sb
    .from('auth_migration_log')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await sb.from('auth_migration_log').update({
      supabase_auth_id: supabaseAuthId,
      status,
      error_message: errorMessage,
      migrated_at: status === 'migrated' ? now : undefined,
      updated_at: now,
    }).eq('user_id', userId)
  } else {
    await sb.from('auth_migration_log').insert({
      id: uuidv4(),
      user_id: userId,
      supabase_auth_id: supabaseAuthId,
      status,
      error_message: errorMessage,
      migrated_at: status === 'migrated' ? now : null,
    })
  }
}

/**
 * Get migration status summary for all users.
 * Used by the Super-Admin migration dashboard API.
 *
 * @returns {{ total: number, migrated: number, pending: number, failed: number, skipped: number, users: array }}
 */
export async function getMigrationStatus() {
  const hasAuthCols = await hasSupabaseAuthColumns()
  if (!hasAuthCols) {
    return { migration_schema_ready: false, message: 'Run add_supabase_auth_columns.sql migration first' }
  }

  const { data: users } = await sb
    .from('users')
    .select('id, username, email, role, auth_provider, supabase_auth_id, created_at')
    .order('created_at', { ascending: false })

  const { data: logs } = await sb
    .from('auth_migration_log')
    .select('user_id, status, error_message, migrated_at, invite_sent_at')

  const logMap = Object.fromEntries((logs || []).map(l => [l.user_id, l]))

  const enriched = (users || []).map(u => ({
    id: u.id,
    username: u.username,
    email: u.email || null,
    role: u.role,
    auth_provider: u.auth_provider || 'custom',
    supabase_auth_id: u.supabase_auth_id || null,
    has_email: Boolean(u.email),
    migration_status: logMap[u.id]?.status || (u.supabase_auth_id ? 'migrated' : 'pending'),
    migrated_at: logMap[u.id]?.migrated_at || null,
    invite_sent_at: logMap[u.id]?.invite_sent_at || null,
    error_message: logMap[u.id]?.error_message || null,
  }))

  const counts = enriched.reduce((acc, u) => {
    acc[u.migration_status] = (acc[u.migration_status] || 0) + 1
    return acc
  }, {})

  return {
    migration_schema_ready: true,
    supabase_auth_enabled: SUPABASE_AUTH_ENABLED,
    total: enriched.length,
    migrated: counts.migrated || 0,
    pending: counts.pending || 0,
    failed: counts.failed || 0,
    skipped: counts.skipped || 0,
    invited: counts.invited || 0,
    users: enriched,
  }
}

/**
 * Batch migrate all users to Supabase Auth.
 * Only migrates users with an email address.
 * Users without email are marked 'skipped'.
 * Runs sequentially with delay to avoid rate limiting.
 *
 * @param {object} opts
 * @param {boolean} opts.sendInvites - if true, send password reset emails after migrating
 * @param {boolean} opts.dryRun - if true, return what would be done without making changes
 * @returns {object} summary of migration results
 */
export async function migrateAllUsersToSupabaseAuth({ sendInvites = false, dryRun = false } = {}) {
  const hasAuthCols = await hasSupabaseAuthColumns()
  if (!hasAuthCols) {
    throw new Error('Run add_supabase_auth_columns.sql migration in Supabase SQL Editor first')
  }

  const { data: users } = await sb
    .from('users')
    .select('id, username, email, auth_provider, supabase_auth_id')
    .is('supabase_auth_id', null) // Only users not yet linked
    .order('created_at', { ascending: true })

  if (!users || users.length === 0) {
    return { ok: true, message: 'All users are already migrated', migrated: 0, skipped: 0, failed: 0 }
  }

  if (dryRun) {
    const withEmail = users.filter(u => u.email)
    const withoutEmail = users.filter(u => !u.email)
    return {
      ok: true,
      dry_run: true,
      would_migrate: withEmail.length,
      would_skip: withoutEmail.length,
      users_with_email: withEmail.map(u => ({ id: u.id, username: u.username, email: u.email })),
      users_without_email: withoutEmail.map(u => ({ id: u.id, username: u.username })),
    }
  }

  const results = { migrated: 0, skipped: 0, failed: 0, invited: 0, errors: [] }

  for (const user of users) {
    try {
      const result = await linkUserToSupabaseAuth(user.id, {
        suppressErrors: true,
        sendInvite: sendInvites,
      })
      if (result.ok) {
        results.migrated++
        if (sendInvites) results.invited++
      } else if (result.error?.includes('no email')) {
        results.skipped++
      } else {
        results.failed++
        results.errors.push({ user_id: user.id, username: user.username, error: result.error })
      }
    } catch (e) {
      results.failed++
      results.errors.push({ user_id: user.id, username: user.username, error: e.message })
    }
    // Small delay to avoid Supabase Auth rate limits
    await new Promise(resolve => setTimeout(resolve, 150))
  }

  return {
    ok: true,
    ...results,
    message: `Migration complete: ${results.migrated} migrated, ${results.skipped} skipped (no email), ${results.failed} failed`,
  }
}
