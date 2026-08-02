export function parsePositiveInt(value, fallback, min = 1, max = 200) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function getPagination(request, { defaultPage = 1, defaultLimit = 50, maxLimit = 200 } = {}) {
  const url = new URL(request.url)
  const page = parsePositiveInt(url.searchParams.get('page'), defaultPage, 1, 100000)
  const limit = parsePositiveInt(url.searchParams.get('limit'), defaultLimit, 1, maxLimit)
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { url, page, limit, from, to }
}
