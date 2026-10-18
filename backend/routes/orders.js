import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// GET /orders, alla ordrar med orderrader, senaste först
router.get('/', async (req, res) => {
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

// POST /orders, skapa order (kunder, ingen inloggning)
router.post('/', async (req, res) => {
  const { customer_name, customer_email, items } = req.body

  const client = await pool.connect()

  try {
    await client.query('BEGIN') // Starta en transaktion

    // Hämta aktuella priser och namn för varje produkt i korgen
    let total = 0
    const orderItemsData = []

    for (const item of items) {
      const productResult = await client.query(
        'SELECT name, price FROM products WHERE id = $1',
        [item.product_id]
      )

      if (!productResult.rows[0]) {
        throw new Error(`Produkt med id ${item.product_id} hittades inte`)
      }

      const { name, price } = productResult.rows[0]
      total += price * item.quantity

      orderItemsData.push({
        product_id: item.product_id,
        product_name: name,
        price_at_purchase: price,
        quantity: item.quantity
      })
    }

    // Skapa själva ordern
    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_email, status, total)
       VALUES ($1, $2, 'Beställd', $3)
       RETURNING *`,
      [customer_name, customer_email, total]
    )
    const order = orderResult.rows[0]

    // Skapa en orderrad per produkt i korgen
    for (const item of orderItemsData) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price_at_purchase, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, item.product_name, item.price_at_purchase, item.quantity]
      )
    }

    await client.query('COMMIT') // Allt gick bra, spara på riktigt
    res.status(201).json({ ...order, items: orderItemsData })

  } catch (err) {
    await client.query('ROLLBACK') // Något gick fel, ångra allt
    console.error(err)
    res.status(500).json({ error: 'Kunde inte skapa ordern' })
  } finally {
    client.release() // Lämna tillbaka databaskopplingen till poolen
  }
})

export default router