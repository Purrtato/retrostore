import { Router } from 'express'
import { pool } from '../db/pool.js'
import { getCustomer } from '../services/customerService.js'
import { requireCustomer } from '../middleware/requireCustomer.js'

const router = Router()

// GET /customer/me: React frågar vem som är inloggad
router.get('/me', async (req, res) => {
  const id = req.session?.customerId
  if (!id) return res.json({ customer: null })

  try {
    res.json({ customer: await getCustomer(id) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta kunden' })
  }
})

// POST /customer/logout: tar bort kunden ur den server-sparade sessionen
router.post('/logout', (req, res) => {
  delete req.session.customerId
  req.session.save(() => res.json({ customer: null }))
})

// GET /customer/orders: kundens egna beställningar. Skyddad på servern (401 utan inloggning).
router.get('/orders', requireCustomer, async (req, res) => {
  try {
    // En kund kan aldrig se någon annans order
    const orders = await pool.query(
      `SELECT id, status, total, shipping_option, shipping_price,
              service_point_name, service_point_address, created_at
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
      [req.session.customerId]
    )

    const ids = orders.rows.map(order => order.id)
    const items = ids.length
      ? await pool.query(
          `SELECT order_id, product_name, price_at_purchase, quantity
           FROM order_items WHERE order_id = ANY($1)`,
          [ids]
        )
      : { rows: [] }

    res.json({
      orders: orders.rows.map(order => ({
        ...order,
        total: Number(order.total),
        shipping_price: Number(order.shipping_price),
        items: items.rows
          .filter(item => item.order_id === order.id)
          .map(item => ({
            product_name: item.product_name,
            price_at_purchase: Number(item.price_at_purchase),
            quantity: item.quantity
          }))
      }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta dina beställningar' })
  }
})

export default router