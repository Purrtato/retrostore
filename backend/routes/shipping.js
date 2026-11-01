import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { getServicePoints, getDeliveryEstimate, PostNordError } from '../integrations/postnordAdapter.js'
import { priceCart, cartItemsSchema, CartError } from '../services/cartService.js'
import { buildQuote } from '../config/shipping.js'

const router = Router()

// Postnumret kan skrivas "111 53" eller "11153". Tar bort mellanslag och kräver fem siffror
const querySchema = z.object({
  postalCode: z.string()
    .transform(s => s.replace(/\s+/g, ''))
    .refine(s => /^\d{5}$/.test(s), 'postnumret måste vara fem siffror')
})

// Läser och kontrollerar postnumret. Svarar 400 och returnerar null om det är ogiltigt
function readPostalCode(req, res) {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map(issue => (issue.code === 'invalid_type' ? 'postnumret saknas' : issue.message))
      .join('; ')
    res.status(400).json({ error: `Ogiltigt postnummer: ${reason}` })
    return null
  }
  return parsed.data.postalCode
}

router.get('/service-points', async (req, res) => {
  const postalCode = readPostalCode(req, res)
  if (!postalCode) return

  try {
    res.json({ items: await getServicePoints(postalCode) })
  } catch (err) {
    console.error(err)
    if (err instanceof PostNordError && err.status === 400) {
      return res.status(400).json({ error: 'Postnumret hittades inte, kontrollera det och försök igen' })
    }
    const status = err instanceof PostNordError ? err.status : 500
    res.status(status).json({ error: 'Kunde inte hämta ombud just nu, försök igen om en stund' })
  }
})

router.get('/estimate', async (req, res) => {
  const postalCode = readPostalCode(req, res)
  if (!postalCode) return

  try {
    res.json(await getDeliveryEstimate(postalCode))
  } catch (err) {
    console.error(err)
    // PostNord kunde inte räkna på postnumret (400)
    if (err instanceof PostNordError && err.status === 400) {
      return res.status(400).json({ error: 'Ingen leveranstid kunde beräknas för postnumret' })
    }
    const status = err instanceof PostNordError ? err.status : 500
    res.status(status).json({ error: 'Kunde inte hämta beräknad leverans just nu' })
  }
})

// Servern räknar ut varusumman från databasen och svarar med fraktpriset för varje alternativ
router.post('/quote', async (req, res) => {
  const parsed = z.object({ items: cartItemsSchema }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig varukorg' })
  }

  try {
    const { goodsOre } = await priceCart(pool, parsed.data.items)
    res.json(buildQuote(goodsOre))
  } catch (err) {
    if (err instanceof CartError) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Kunde inte räkna ut frakten' })
  }
})

export default router