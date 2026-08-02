import { v4 as uuidv4 } from 'uuid'
import { json } from '../utils/apiResponse'
import { getUserFromRequest } from '../middleware/authMiddleware'
import { supabaseAdmin as sb } from '@/lib/supabase'

export class PushTokenController {
  static async registerToken(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { token, device_name } = await request.json().catch(() => ({}))
    if (!token) return json({ error: 'token required' }, 400)

    const { error } = await sb.from('push_tokens').upsert({
      id: uuidv4(),
      user_id: user.id,
      token: token.trim(),
      device_name: device_name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'token' })

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  static async deleteToken(request, tokenParam) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const token = decodeURIComponent(tokenParam)
    await sb.from('push_tokens').delete().eq('token', token).eq('user_id', user.id)
    return json({ ok: true })
  }
}
