import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { createCheckoutSession, PaymentError } from '../integrations/stripeAdapter.js'

const router = Router()

// Fel med en HTTP-status och ett meddelande
class CheckoutError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// React skickar bara vilka produkter och hur många, aldrig några priser
const bodySchema = z.object({
  customer_name: z.string().trim().min(1, 'namn saknas').max(100, 'namnet är för långt'),
  customer_email: z.string().trim().email('ogiltig e-postadress').max(200),
  items: z.array(
    z.object({
      product_id: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1, 'antalet måste vara minst 1').max(99, 'antalet får vara högst 99')
    })
  ).min(1, 'varukorgen är tom').max(50, 'för många olika produkter')
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

// Skapar en obetald order och en Stripe-session. Svarar { url }.
router.post('/', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: `Ogiltig beställning: ${describeIssues(parsed.error.issues)}` })
  }
  const { customer_name, customer_email, items } = parsed.data

  // Samma produkt på flera rader slås ihop till en rad
  const wanted = new Map()
  for (const item of items) {
    wanted.set(item.product_id, (wanted.get(item.product_id) ?? 0) + item.quantity)
  }

  const client = await pool.connect()
  let orderId
  let lines
  try {
    await client.query('BEGIN')

    // Priser och saldo hämtas från databasen. Det som React eventuellt skickat med används aldrig.
    const productResult = await client.query(
      'SELECT id, name, price, stock FROM products WHERE id = ANY($1) AND is_active = true',
      [[...wanted.keys()]]
    )
    const byId = new Map(productResult.rows.map(p => [Number(p.id), p]))

    lines = []
    for (const [productId, quantity] of wanted) {
      const product = byId.get(productId)
      if (!product) {
        throw new CheckoutError('En av produkterna i varukorgen finns inte längre', 400)
      }
      // Saldot kontrolleras när ordern skapas, så att en produkt med för lågt saldo inte kan köpas
      if (Number(product.stock) < quantity) {
        throw new CheckoutError(`Det finns bara ${product.stock} st av "${product.name}" i lager`, 409)
      }
      lines.push({
        productId,
        name: product.name,
        quantity,
        // Räknar i ören (heltal) för att undvika avrundningsfel med decimaltal
        unitAmountOre: Math.round(Number(product.price) * 100)
      })
    }

    const totalOre = lines.reduce((sum, l) => sum + l.unitAmountOre * l.quantity, 0)

    // Ordern sparas som obetald innan kunden skickas till Stripe
    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_email, status, total)
       VALUES ($1, $2, 'Obetald', $3)
       RETURNING id`,
      [customer_name, customer_email, totalOre / 100]
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
    if (err instanceof CheckoutError) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error(err)
    return res.status(500).json({ error: 'Kunde inte skapa ordern' })
  } finally {
    client.release()
  }

  // Ordern finns nu i databasen. Därefter skapar vi betalningen hos Stripe.
  try {
    const session = await createCheckoutSession({ orderId, customerEmail: customer_email, lines })
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

// Bekräftelsesidan frågar vilken status ordern har

router.get('/order/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  if (!/^cs_[A-Za-z0-9_]{10,}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Ogiltigt sessions-id' })
  }

  try {
    const orderResult = await pool.query(
      'SELECT id, customer_name, status, total FROM orders WHERE stripe_session_id = $1',
      [sessionId]
    )
    const order = orderResult.rows[0]
    if (!order) return res.status(404).json({ error: 'Ordern hittades inte' })

    const itemsResult = await pool.query(
      'SELECT product_name, price_at_purchase, quantity FROM order_items WHERE order_id = $1',
      [order.id]
    )
    res.json({ ...order, total: Number(order.total), items: itemsResult.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta ordern' })
  }
})

export default router