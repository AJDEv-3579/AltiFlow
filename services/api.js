// Core API Service & Session Token Storage

export function getToken() {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('altiflow_token')
}

export function setToken(token) {
  sessionStorage.setItem('altiflow_token', token)
  // Remove legacy persistent token so browser re-open requires sign-in
  localStorage.removeItem('altiflow_token')
}

export function clearToken() {
  sessionStorage.removeItem('altiflow_token')
  localStorage.removeItem('altiflow_token')
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { cache: 'no-store', ...opts, headers })
  const data = await res.json().catch(() => ({}))
  
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}
