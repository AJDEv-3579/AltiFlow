import jwt from 'jsonwebtoken'
import { supabaseAdmin as sb } from '@/lib/supabase'

const JWT_SECRET = process.env.JWT_SECRET || 'altiflow_dev_secret'

export async function getUserFromRequest(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const { data } = await sb.from('users').select('*').eq('id', decoded.sub).maybeSingle()
    return data
  } catch (e) {
    return null
  }
}

export function authorizeRoles(user, allowedRoles) {
  if (!user) return { authorized: false, status: 401, error: 'Unauthorized' }
  if (!allowedRoles.includes(user.role)) return { authorized: false, status: 403, error: 'Forbidden' }
  return { authorized: true }
}
