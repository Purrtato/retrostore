import { pool } from '../db/pool.js'
import { saveProducts, removeProducts, configureIndex } from '../integrations/algoliaAdapter.js'

const WARNING =
  'Ändringen är sparad, men sökindexet är inte uppdaterat. Tryck på "Synka sökindex" när sökningen fungerar igen.'

// Uppdaterar sökindexet för givna rader från databasen.
// databasen är redan uppdaterad, så ett fel i Algolia ska bara bli en varning till admin.
export async function syncProducts(rows) {
  try {
    const active = rows.filter(r => r.is_active)     // aktiva produkter ska finnas i sökningen
    const inactive = rows.filter(r => !r.is_active)  // borttagna produkter ska bort ur sökningen
    if (active.length) await saveProducts(active)
    if (inactive.length) await removeProducts(inactive)
    return { synced: true }
  } catch (err) {
    console.error('Synk till sökindexet misslyckades:', err.message)
    return { synced: false, warning: WARNING }
  }
}

// Skickar alla produkter till indexet (första fyllningen, eller för att laga efter ett avbrott).
// Här kastas fel vidare, eftersom admin själv tryckte på knappen och ska se vad som gick fel.
export async function reindexAll() {
  await configureIndex().catch(err => console.warn('Kunde inte ställa in indexet:', err.message))

  const { rows } = await pool.query('SELECT * FROM products ORDER BY id')
  const active = rows.filter(r => r.is_active)
  const inactive = rows.filter(r => !r.is_active)

  if (active.length) await saveProducts(active)
  if (inactive.length) await removeProducts(inactive)
  return { indexed: active.length, removed: inactive.length }
}