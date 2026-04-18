const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('winterview.token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function handle(res: Response): Promise<any> {
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = body.detail || JSON.stringify(body)
    } catch {}
    throw new Error(`${res.status}: ${msg}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  if (ct.startsWith('audio/')) return res.blob()
  return res.text()
}

export const api = {
  base: BASE,

  get: (path: string): Promise<any> =>
    fetch(`${BASE}${path}`, { headers: { ...authHeader() } }).then(handle),

  post: (path: string, body?: unknown): Promise<any> =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    }).then(handle),

  postForm: (path: string, formData: FormData): Promise<any> =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { ...authHeader() },
      body: formData,
    }).then(handle),

  postRaw: async (path: string, body?: unknown): Promise<Blob> => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`${res.status}`)
    return res.blob()
  },

  delete: (path: string): Promise<any> =>
    fetch(`${BASE}${path}`, {
      method: 'DELETE',
      headers: { ...authHeader() },
    }).then(handle),
}
