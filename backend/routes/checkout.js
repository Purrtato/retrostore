import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { createCheckoutSession, PaymentError } from '../integrations/stripeAdapter.js'
import { getServicePoints, PostNordError } from '../integrations/postnordAdapter.js'
import { priceCart, cartItemsSchema, CartError } from '../services/cartService.js'
import { SHIPPING_OPTIONS, shippingPriceOre } from '../config/shipping.js'

const router = Router()

// React skickar bara produkter och antal, kunduppgifter och leveransval, aldrig några priser
const bodySchema = z.object({
  customer_name: z.string().trim().min(1, 'namn saknas').max(100, 'namnet är för långt'),
  customer_email: z.string().trim().email('ogiltig e-postadress').max(200),
  items: cartItemsSchema,
  shipping_option: z.string().refine(v => Object.hasOwn(SHIPPING_OPTIONS, v), 'välj ombud eller hemleverans'),
  postal_code: z.string()
    .transform(s => s.replace(/\s+/g, ''))
    .refine(s => /^\d{5}$/.test(s), 'postnumret måste vara fem siffror'),
  service_point_id: z.string().trim().max(50).optional()
})

function describeIssues(issues) {
  return issues
    .map(issue => {
      const field = issue.path.join('.')
      if (issue.code === 'invalid_type') return `${field} saknas eller är ogiltigt`
      return `${field}: ${issue.message}`
    })
    .join('; ')
}

// POST /api/checkout, skapar en obetald order med frakt och en Stripe-session
router.post('/', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: `Ogiltig beställning: ${describeIssues(parsed.error.issues)}` })
  }
  const { customer_name, customer_email, items, shipping_option, postal_code, service_point_id } = parsed.data

  let servicePoint = null
  if (shipping_option === 'pickup') {
    if (!service_point_id) return res.status(400).json({ error: 'Välj ett ombud' })

    try {
      const available = await getServicePoints(postal_code)
      servicePoint = available.find(sp => sp.id === service_point_id) ?? null
    } catch (err) {
      if (err instanceof PostNordError && err.status === 400) {
        return res.status(400).json({ error: 'Postnumret hittades inte, kontrollera det och försök igen' })
      }
      console.error(err)
      // Ordern skapas inte, så ingenting blir kvar i databasen
      return res.status(502).json({ error: 'Kunde inte kontrollera ombudet hos PostNord just nu, försök igen om en stund' })
    }
    if (!servicePoint) {
      return res.status(400).json({ error: 'Det valda ombudet finns inte för postnumret' })
    }
  }

  const client = await pool.connect()
  let orderId
  let lines
  let shippingOre
  try {
    await client.query('BEGIN')

    // Priser och saldo från databasen, och saldot kontrolleras
    const priced = await priceCart(client, items, { checkStock: true })
    lines = priced.lines
    shippingOre = shippingPriceOre(shipping_option, priced.goodsOre) // fri frakt när gränsen är nådd
    const totalOre = priced.goodsOre + shippingOre

    const servicePointAddress = servicePoint
      ? `${servicePoint.street}, ${servicePoint.postalCode} ${servicePoint.city}`
      : null

    const orderResult = await client.query(
      `INSERT INTO orders
         (customer_name, customer_email, status, total,
          shipping_option, shipping_price, shipping_postal_code,
          service_point_id, service_point_name, service_point_address)
       VALUES ($1, $2, 'Obetald', $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        customer_name, customer_email, totalOre / 100,
        shipping_option, shippingOre / 100, postal_code,
        servicePoint?.id ?? null, servicePoint?.name ?? null, servicePointAddress
      ]
    )
    orderId = orderResult.rows[0].id

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price_at_purchase, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, line.productId, line.name, line.unitAmountOre / 100, line.quantity]
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    if (err instanceof CartError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error(err)
    return res.status(500).json({ error: 'Kunde inte skapa ordern' })
  } finally {
    client.release()
  }
  try {
    const shippingLabel = shipping_option === 'pickup'
      ? `Frakt: Ombud (${servicePoint.name})`
      : 'Frakt: Hemleverans'

    const session = await createCheckoutSession({
      orderId,
      customerEmail: customer_email,
      lines,
      shipping: { label: shippingLabel, amountOre: shippingOre }
    })
    await pool.query('UPDATE orders SET stripe_session_id = $1 WHERE id = $2', [session.id, orderId])
    res.json({ url: session.url })
  } catch (err) {
    // Stripe nere eller fel: kunden får ett meddelande, och ordern förblir obetald
    const status = err instanceof PaymentError ? err.status : 500
    const message = err instanceof PaymentError ? err.message : 'Kunde inte starta betalningen'
    if (!(err instanceof PaymentError)) console.error(err)
    res.status(status).json({ error: message })
  }
})

// GET /api/checkout/order/:sessionId, bekräftelsesidan frågar vilken status ordern har
router.get('/order/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  if (!/^cs_[A-Za-z0-9_]{10,}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Ogiltigt sessions-id' })
  }

  try {
    const orderResult = await pool.query(
      `SELECT id, customer_name, status, total,
              shipping_option, shipping_price, service_point_name, service_point_address
       FROM orders WHERE stripe_session_id = $1`,
      [sessionId]
    )
    const order = orderResult.rows[0]
    if (!order) return res.status(404).json({ error: 'Ordern hittades inte' })

    const itemsResult = await pool.query(
      'SELECT product_name, price_at_purchase, quantity FROM order_items WHERE order_id = $1',
      [order.id]
    )
    res.json({
      ...order,
      total: Number(order.total),
      shipping_price: Number(order.shipping_price),
      items: itemsResult.rows
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta ordern' })
  }
})

export default router