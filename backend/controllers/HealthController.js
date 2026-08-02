import { json } from '../utils/apiResponse'
import { supabaseAdmin as sb } from '@/lib/supabase'

let seedDone = false
let seedError = null

export async function ensureSeed() {
  if (seedDone) return
  try {
    const { error: probeErr } = await sb.from('users').select('id').limit(1)
    if (probeErr) {
      seedError = `Supabase tables not found. Please run /supabase/schema.sql in the SQL Editor. (${probeErr.message})`
      console.error('[Altiflow]', seedError)
      return
    }
    seedError = null

    const { data: superAdmin } = await sb.from('users').select('id').eq('username', 'devbond01').maybeSingle()
    if (!superAdmin) {
      const bcrypt = (await import('bcryptjs')).default
      const { v4: uuidv4 } = await import('uuid')
      await sb.from('users').insert({
        id: uuidv4(),
        username: 'devbond01',
        password_hash: await bcrypt.hash('63pk0wpT@123', 10),
        role: 'Super-Admin', client_id: null, must_change_password: false,
      })
    }
    seedDone = true
    console.log('[Altiflow] Seed complete')
  } catch (e) {
    seedError = `Seed failed: ${e.message}`
    console.error('[Altiflow]', seedError)
  }
}

export class HealthController {
  static async getHealth(request) {
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

  static getSeedError() {
    return seedError
  }
}
