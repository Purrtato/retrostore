import { Router } from 'express'
import { z } from 'zod'
import { createLoginRequest, exchangeCode, verifyIdToken, safeEqual, GoogleAuthError } from '../integrations/googleAdapter.js'
import { upsertCustomer } from '../services/customerService.js'

const router = Router()

const OAUTH_MAX_AGE_MS = 10 * 60 * 1000 // en påbörjad inloggning gäller i 10 minuter
const KNOWN_ERRORS = ['cancelled', 'invalid_state', 'google_unavailable', 'invalid_token', 'unverified_email', 'failed']

// Skickar tillbaka kunden till inloggningssidan med en felkod. React översätter koden till ett begripligt meddelande
function fail(res, code) {
  const known = KNOWN_ERRORS.includes(code) ? code : 'failed'
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  res.redirect(`${clientUrl}/login?error=${known}`)
}

// GET /auth/google/start: kunden klickar på "Logga in med Google" och hamnar här
router.get('/start', (req, res) => {
  try {
    const { url, state, nonce, codeVerifier } = createLoginRequest()

    // Engångsvärdena sparas i kundens session på servern (de skickas aldrig till webbläsaren)
    req.session.oauth = { state, nonce, codeVerifier, createdAt: Date.now() }

    // Väntar tills sessionen är sparad innan kunden skickas vidare
    req.session.save(err => {
      if (err) {
        console.error(err)
        return fail(res, 'failed')
      }
      res.redirect(url)
    })
  } catch (err) {
    console.error(err)
    fail(res, 'failed')
  }
})

const callbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(200)
})

// GET /auth/google/callback: Google skickar tillbaka kunden hit
router.get('/callback', async (req, res) => {
  const saved = req.session.oauth
  delete req.session.oauth // engångsvärden, de kan aldrig användas två gånger

  // Kunden avbröt hos Google (eller Google skickade ett fel)
  if (req.query.error) {
    return fail(res, req.query.error === 'access_denied' ? 'cancelled' : 'failed')
  }

  // Värdet från Google måste matcha det som sparades när inloggningen startade
  const query = callbackSchema.safeParse(req.query)
  if (!query.success || !saved) return fail(res, 'invalid_state')
  if (Date.now() - saved.createdAt > OAUTH_MAX_AGE_MS) return fail(res, 'invalid_state')
  if (!safeEqual(query.data.state, saved.state)) return fail(res, 'invalid_state')

  try {
    // Byt koden mot tokens, med client secret och code verifier
    const idToken = await exchangeCode(query.data.code, saved.codeVerifier)

    // Verifiera ID-token (signatur, iss, aud, exp, nonce) och läs ut kunden
    const claims = await verifyIdToken(idToken, saved.nonce)
    if (!claims.emailVerified) return fail(res, 'unverified_email')

    // Hitta kunden via sub, eller skapa den första gången
    const customer = await upsertCustomer(claims)

    // Logga in kunden i shoppens egen session. Ett nytt sessions-id skyddar mot session fixation.
    // Googles tokens sparas inte och når aldrig webbläsaren, bara session-cookien gör det
    req.session.regenerate(regenerateError => {
      if (regenerateError) {
        console.error(regenerateError)
        return fail(res, 'failed')
      }
      req.session.customerId = customer.id
      req.session.save(saveError => {
        if (saveError) {
          console.error(saveError)
          return fail(res, 'failed')
        }
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
        res.redirect(`${clientUrl}/mina-sidor`)
      })
    })
  } catch (err) {
    console.error(err)
    fail(res, err instanceof GoogleAuthError ? err.code : 'failed')
  }
})

export default router