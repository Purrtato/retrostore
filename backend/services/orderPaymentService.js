import { pool } from '../db/pool.js'
import { syncProducts } from './searchIndexService.js'

// Markerar ordern som betald och minskar lagersaldot. Säker att köra flera gånger:
// bara den första händelsen hittar en 'Obetald' order, så saldot minskas aldrig två gånger.
export async function markOrderPaid(orderId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Villkoret status = 'Obetald' gör att en redan betald eller avbruten order aldrig ändras
    const updated = await client.query(
      `UPDATE orders SET status = 'Betald', paid_at = now()
       WHERE id = $1 AND status = 'Obetald'
       RETURNING id`,
      [orderId]
    )
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK')
      return { changed: false } // redan hanterad (eller okänd order), inget att göra
    }

    // Minska saldot med köpt antal för varje produkt i ordern
    await client.query(
      `UPDATE products p
       SET stock = GREATEST(p.stock - oi.qty, 0)
       FROM (
         SELECT product_id, SUM(quantity) AS qty
         FROM order_items WHERE order_id = $1 GROUP BY product_id
       ) oi
       WHERE p.id = oi.product_id`,
      [orderId]
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err // webhooken svarar 500, och Stripe försöker igen senare
  } finally {
    client.release()
  }

  // Efter att databasen är sparad: uppdatera sökindexet med de nya saldona (kastar aldrig fel)
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE id IN (SELECT product_id FROM order_items WHERE order_id = $1)`,
    [orderId]
  )
  await syncProducts(rows)

  return { changed: true }
}

// Markerar en övergiven order som avbruten. En betald order ändras aldrig.
export async function markOrderCancelled(orderId) {
  const result = await pool.query(
    `UPDATE orders SET status = 'Avbruten' WHERE id = $1 AND status = 'Obetald'`,
    [orderId]
  )
  return { changed: result.rowCount > 0 }
}