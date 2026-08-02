const LIST_CACHE_TTL_MS = 10000
const LIST_CACHE_MAX_ENTRIES = 500
const listCache = new Map()

export function getCachedList(key) {
  const hit = listCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    listCache.delete(key)
    return null
  }
  return hit.payload
}

export function setCachedList(key, payload, ttlMs = LIST_CACHE_TTL_MS) {
  listCache.set(key, { payload, expiresAt: Date.now() + ttlMs })
  if (listCache.size <= LIST_CACHE_MAX_ENTRIES) return
  for (const [k, v] of listCache) {
    if (v.expiresAt <= Date.now()) listCache.delete(k)
  }
  if (listCache.size <= LIST_CACHE_MAX_ENTRIES) return
  const firstKey = listCache.keys().next().value
  if (firstKey) listCache.delete(firstKey)
}

export function invalidateCachedLists(prefix) {
  for (const key of listCache.keys()) {
    if (key.startsWith(prefix)) listCache.delete(key)
  }
}
