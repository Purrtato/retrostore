const TIMEOUT_MS = 10000 // varje anrop avbryts efter 10 sekunder

export class StorageError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

function getConfig() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '') 
  const key = process.env.SUPABASE_SECRET_KEY
  const bucket = process.env.SUPABASE_BUCKET
  if (!baseUrl || !key || !bucket) {
    throw new StorageError('Bildlagringen är inte konfigurerad på servern', 500)
  }
  return { baseUrl, key, bucket }
}

function authHeaders(key) {
  const headers = { apikey: key }
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`
  return headers
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

// Den publika adressen till en fil i en publik bucket
export function publicUrl(path) {
  const { baseUrl, bucket } = getConfig()
  return `${baseUrl}/storage/v1/object/public/${bucket}/${encodePath(path)}`
}

// Gemensamt anrop med timeout
async function request({ method, path, body, headers = {} }) {
  const { baseUrl, key, bucket } = getConfig()
  const url = `${baseUrl}/storage/v1/object/${bucket}/${encodePath(path)}`
  try {
    return await fetch(url, {
      method,
      headers: { ...authHeaders(key), ...headers },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    } catch (err) {
    // Loggas bara på servern (aldrig några nycklar)
    console.error('Supabase Storage-anrop misslyckades:', err.name, err.cause?.code || err.message)
    if (err.name === 'TimeoutError') {
      throw new StorageError('Bildlagringen svarade inte i tid, försök igen om en stund', 504)
    }
    throw new StorageError('Kunde inte nå bildlagringen, försök igen om en stund', 502)
  }
}

// Laddar upp en fil på en ny sökväg
export async function uploadImage({ path, buffer, contentType }) {
  const res = await request({
    method: 'POST',
    path,
    body: buffer,
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' }
  })

  if (res.status === 401 || res.status === 403) {
    throw new StorageError('Bildlagringen nekade åtkomst (kontrollera nyckeln)', 502)
  }
  if (!res.ok) {
    // Loggas bara på servern: Supabase förklarar själva felet
    console.error('Supabase Storage svarade', res.status, await res.text().catch(() => ''))
    throw new StorageError('Bildlagringen svarade med fel, försök igen om en stund', 502)
  }
  return { path, url: publicUrl(path) }
}

// Tar bort en fil
export async function deleteImage(path) {
  const res = await request({ method: 'DELETE', path })
  if (res.status === 404) return
  if (!res.ok) {
    console.error('Supabase Storage (delete) svarade', res.status, await res.text().catch(() => ''))
    throw new StorageError('Kunde inte ta bort den gamla bilden', 502)
  }
}