// Läser in .env innan Pool skapas, annars är DATABASE_URL undefined
import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

// En enda pool som delas av hela appen (alla routes importerar den här)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Test vid uppstart så att vi ser om databasen svarar
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('DB-fel:', err)
  else console.log('DB ansluten:', res.rows[0])
})