import { z } from 'zod'

const TIMEOUT_MS = 5000
const RESEND_URL = 'https://api.resend.com/emails'

// Eget felobjekt. Mejlfel stoppar aldrig ordern, så loggar dem bara.
export class EmailError extends Error {}

// Resends svar när mejlet har tagits emot, ett id. Validerar det innan det används.
const successSchema = z.object({ id: z.string().min(1) })

export async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) throw new EmailError('E-posttjänsten är inte konfigurerad på servern')

  let res
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    // Aldrig nyckeln i loggen, vi loggar bara orsaken
    throw new EmailError(err.name === 'TimeoutError' ? 'Resend svarade inte i tid' : 'Kunde inte nå Resend')
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    // Resends egen förklaring hamnar i loggen
    throw new EmailError(`Resend svarade ${res.status}: ${data?.name ?? ''} ${data?.message ?? ''}`.trim())
  }

  const parsed = successSchema.safeParse(data)
  if (!parsed.success) throw new EmailError('Oväntat svar från Resend')
  return { id: parsed.data.id }
}