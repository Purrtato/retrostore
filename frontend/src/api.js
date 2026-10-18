import { API_URL } from './config'

// Alla anrop till vårt API går via den här funktionen.
export async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // skickar och tar emot session-cookien
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const data = await res.json().catch(() => null)

  // Gör om felsvar till riktiga fel så att vi kan fånga dem med try/catch
  if (!res.ok) {
    const error = new Error(data?.error || 'Något gick fel')
    error.status = res.status
    throw error
  }
  return data
}