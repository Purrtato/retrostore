import { pool } from '../db/pool.js'

// Skapar kunden första gången (nytt sub), och hittar samma kund nästa gång.
// Använder Googles sub som identitet, e-postadressen kan ändras och används aldrig för att slå ihop konton.
export async function upsertCustomer({ sub, email, name }) {
  const { rows } = await pool.query(
    `INSERT INTO customers (google_sub, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id, name, email`,
    [sub, email, name]
  )
  return rows[0]
}

export async function getCustomer(id) {
  const { rows } = await pool.query('SELECT id, name, email FROM customers WHERE id = $1', [id])
  return rows[0] ?? null
}