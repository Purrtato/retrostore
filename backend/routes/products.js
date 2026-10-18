import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// GET /products, alla aktiva produkter (prefixet /products läggs på i app.js)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE is_active = true ORDER BY id'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta produkter' })
  }
})

// GET /products/:id, en produkt
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [req.params.id]
    )

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Produkten hittades inte' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte hämta produkten' })
  }
})

// POST /products, skapa produkt
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, price, category, stock, image_url } = req.body

    const result = await pool.query(
      `INSERT INTO products (name, description, price, category, stock, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [name, description, price, category, stock, image_url]
    )

    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte skapa produkten' })
  }
})

// PUT /products/:id, uppdatera produkt
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, price, category, stock, image_url } = req.body

    const result = await pool.query(
      `UPDATE products
       SET name = $1, description = $2, price = $3, category = $4, stock = $5, image_url = $6
       WHERE id = $7
       RETURNING *`,
      [name, description, price, category, stock, image_url, req.params.id]
    )

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Produkten hittades inte' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte uppdatera produkten' })
  }
})

// DELETE /products/:id, "mjuk" borttagning (is_active = false)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE products SET is_active = false WHERE id = $1 RETURNING *`,
      [req.params.id]
    )

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Produkten hittades inte' })
    }

    res.json({ message: 'Produkten togs bort', product: result.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Kunde inte ta bort produkten' })
  }
})

export default router