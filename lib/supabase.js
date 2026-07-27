import { createClient } from '@supabase/supabase-js'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const isConfigured = Boolean(
  rawUrl &&
  serviceKey &&
  !rawUrl.includes('YOUR_PROJECT_REF') &&
  !serviceKey.includes('YOUR_SERVICE_ROLE_KEY')
)

if (!isConfigured) {
  console.warn(
    '[Altiflow] Warning: Supabase env vars are missing or set to placeholder values.\n' +
    '  → Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
}

// Strip trailing slash and /rest/v1 — prevents "Invalid path" PostgREST error
const url = (rawUrl || 'https://placeholder-ref.supabase.co').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
const key = serviceKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'

// Admin client — bypasses RLS. Use ONLY in server-side code (API routes).
export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
