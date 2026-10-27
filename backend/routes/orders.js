import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// GET /orders, alla ordrar med orderrader, senaste först
router.get('/', requireAdmin, async (req, res) => {
  try {
    const ordersResult = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC'
    )

    // För varje order, hämta även vilka produkter som beställdes
    const orders = await Promise.all(
      ordersResult.rows.map(async order => {
        const itemsResult = await pool.query(
          'SELECT * FROM order_items WHERE order_id = $1',
          [order.id]
        )
        return { ...order, items: itemsResult.rows }
      })
    )

    res.json(orders)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta ordrar' })
  }
})

export default router