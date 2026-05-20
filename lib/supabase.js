import { createClient } from '@supabase/supabase-js'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!rawUrl || !serviceKey || rawUrl.includes('YOUR_PROJECT_REF') || serviceKey.includes('YOUR_SERVICE_ROLE_KEY')) {
  throw new Error(
    '[Altiflow] Supabase env vars are missing or still set to placeholder values.\n' +
    '  → Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (local) or Vercel dashboard (production).\n' +
    '  → Get values from: Supabase Dashboard → Project Settings → API'
  )
}

// Strip trailing slash — prevents "Invalid path" PostgREST error
const url = rawUrl.replace(/\/+$/, '')

// Admin client — bypasses RLS. Use ONLY in server-side code (API routes).
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
