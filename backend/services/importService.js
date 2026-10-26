import { pool } from '../db/pool.js'
import { fetchSupplierProducts } from '../integrations/supplierAdapter.js'

// Upsert: skapar produkten, eller uppdaterar den om artikelnumret redan finns.
const UPSERT_SQL = `
  INSERT INTO products
    (article_number, name, description, price, category, stock, image_url, ean, variants, is_active)
  VALUES ($1, $2, '', $3, $4, $5, '', $6, $7::jsonb, true)
  ON CONFLICT (article_number) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    category = EXCLUDED.category,
    stock = EXCLUDED.stock,
    ean = EXCLUDED.ean,
    variants = EXCLUDED.variants
`

export async function importProducts(format) {
  // Hämtning och validering sker före transaktionen, så att ett leverantörsfel aldrig kan ge en halv import
  const { products, skipped } = await fetchSupplierProducts(format)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(
      'SELECT article_number FROM products WHERE article_number = ANY($1)',
      [products.map(p => p.article_number)]
    )
    const existingSet = new Set(existing.rows.map(r => r.article_number))

    let created = 0
    let updated = 0

    for (const p of products) {
      await client.query(UPSERT_SQL, [
        p.article_number, p.name, p.price, p.category, p.stock, p.ean,
        JSON.stringify(p.variants)
      ])
      if (existingSet.has(p.article_number)) updated++
      else created++
    }

    await client.query('COMMIT')
    return { created, updated, skipped }
  } catch (err) {
    await client.query('ROLLBACK') // något gick fel: ångra allt
    throw err
  } finally {
    client.release() // lämna tillbaka anslutningen till poolen
  }
}