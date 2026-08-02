const uiListCache = new Map()

export function getUiListCache(key) {
  const hit = uiListCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    uiListCache.delete(key)
    return null
  }
  return hit.value
}

export function setUiListCache(key, value, ttlMs = 10000) {
  uiListCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function clearUiListCache(prefix) {
  if (!prefix) {
    uiListCache.clear()
    return
  }
  for (const key of uiListCache.keys()) {
    if (key.startsWith(prefix)) uiListCache.delete(key)
  }
}
