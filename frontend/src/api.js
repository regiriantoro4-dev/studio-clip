export async function api(path, opts = {}) {
  const init = { ...opts }
  if (init.body && !(init.body instanceof FormData)) {
    init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
    init.body = JSON.stringify(init.body)
  }
  const r = await fetch(path, init)
  if (!r.ok) {
    let msg = r.statusText
    try {
      const j = await r.json()
      msg = j.detail || JSON.stringify(j)
    } catch { /* biarkan statusText */ }
    throw new Error(msg)
  }
  return r.json()
}
