import { Router } from 'express'
import crypto from 'crypto'

const router = Router()

// Jämför två strängar utan att läcka information via svarstiden.
// Vi hashar först så att båda alltid är lika långa (krav för timingSafeEqual).
function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest()
  const hashB = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

// POST /auth/login, body: { username, password }
router.post('/login', (req, res) => {
  const { username, password } = req.body

  const ok =
    safeEqual(username ?? '', process.env.ADMIN_USERNAME) &&
    safeEqual(password ?? '', process.env.ADMIN_PASSWORD)

  if (!ok) {
    return res.status(401).json({ error: 'Fel användarnamn eller lösenord' })
  }

  // regenerate() ger ett nytt sessions-id vid inloggning (skydd mot session fixation)
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Inloggningen misslyckades' })

    req.session.isAdmin = true
    // save() ser till att sessionen är sparad i databasen innan vi svarar
    req.session.save(err2 => {
      if (err2) return res.status(500).json({ error: 'Inloggningen misslyckades' })
      res.json({ isAdmin: true })
    })
  })
})

// POST /auth/logout, förstör sessionen och rensar cookien
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ isAdmin: false })
  })
})

// GET /auth/me, React frågar om man fortfarande är inloggad (t.ex. vid sidladdning)
router.get('/me', (req, res) => {
  res.json({ isAdmin: Boolean(req.session?.isAdmin) })
})

export default router