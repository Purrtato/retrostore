import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'

const TIMEOUT_MS = 5000

export class GoogleAuthError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// Googles OpenID Connect-adresser
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs' 
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

// Hämtar och cachar Googles nycklar vid behov, med timeout
const jwks = createRemoteJWKSet(new URL(JWKS_URL), { timeoutDuration: TIMEOUT_MS })

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleAuthError('failed', 'Google-inloggningen är inte konfigurerad på servern')
  }
  return { clientId, clientSecret, redirectUri }
}

// Jämför två strängar utan att läcka information via svarstiden
export function safeEqual(a, b) {
  const hashA = createHash('sha256').update(String(a)).digest()
  const hashB = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(hashA, hashB)
}

export function createLoginRequest() {
  const { clientId, redirectUri } = getConfig()

  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  // Till Google skickas bara en hash av verifieraren. Själva verifieraren skickas först när koden byts.
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }).toString()

  return { url: url.toString(), state, nonce, codeVerifier }
}

// Behöver bara ID-token. Access-token från Google används inte och sparas aldrig.
const tokenResponseSchema = z.object({ id_token: z.string().min(1) })

export async function exchangeCode(code, codeVerifier) {
  const { clientId, clientSecret, redirectUri } = getConfig()

  let res
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    console.error('Google token-anrop misslyckades:', err.name, err.cause?.code || err.message)
    throw new GoogleAuthError('google_unavailable', 'Kunde inte nå Google')
  }

  if (!res.ok) {
    // Googles egen förklaring loggas bara på servern (t.ex. invalid_grant)
    console.error('Google svarade', res.status, (await res.text().catch(() => '')).slice(0, 300))
    throw new GoogleAuthError(res.status >= 500 ? 'google_unavailable' : 'failed', 'Google nekade koden')
  }

  const parsed = tokenResponseSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new GoogleAuthError('failed', 'Oväntat svar från Google')
  return parsed.data.id_token
}

// Det vi litar på i ID-token efter verifieringen. Zod kontrollerar innehållet.
const claimsSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(320),
  email_verified: z.union([z.boolean(), z.literal('true'), z.literal('false')]).transform(v => v === true || v === 'true'),
  name: z.string().max(200).optional(),
  nonce: z.string().optional()
})

export async function verifyIdToken(idToken, expectedNonce) {
  const { clientId } = getConfig()

  let payload
  try {
    ;({ payload } = await jwtVerify(idToken, jwks, { issuer: ISSUERS, audience: clientId }))
  } catch (err) {
    console.error('ID-token kunde inte verifieras:', err.code || err.name)
    // Fel i själva token (signatur, iss, aud, exp) är något annat än att Googles nycklar inte gick att hämta
    const tokenProblem = /^ERR_(JWT|JWS)_/.test(err.code ?? '') || err.code === 'ERR_JWKS_NO_MATCHING_KEY'
    throw new GoogleAuthError(tokenProblem ? 'invalid_token' : 'google_unavailable', 'Ogiltig ID-token')
  }

  const claims = claimsSchema.safeParse(payload)
  if (!claims.success) throw new GoogleAuthError('invalid_token', 'ID-token saknar förväntade uppgifter')

  // Tokenen måste höra till just den här inloggningen
  if (!claims.data.nonce || !safeEqual(claims.data.nonce, expectedNonce)) {
    throw new GoogleAuthError('invalid_token', 'Fel nonce')
  }

  return {
    sub: claims.data.sub,
    email: claims.data.email,
    emailVerified: claims.data.email_verified,
    name: claims.data.name ?? claims.data.email
  }
}