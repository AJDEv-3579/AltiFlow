import { NextResponse } from 'next/server'

export function corsify(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export function json(data, status = 200) {
  return corsify(NextResponse.json(data, { status }))
}

export function stripSensitiveFields(doc) {
  if (!doc) return doc
  const { password_hash, passcode_key_hash, ...rest } = doc
  return rest
}

export function handleOptionsRequest() {
  return corsify(new NextResponse(null, { status: 200 }))
}
