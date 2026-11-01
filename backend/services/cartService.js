import { z } from 'zod'

// Fel med en HTTP-status och ett meddelande som är säkert att visa för kunden
export class CartError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// React skickar vilka produkter och hur många, aldrig några priser
export const cartItemsSchema = z.array(
  z.object({
    product_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1, 'antalet måste vara minst 1').max(99, 'antalet får vara högst 99')
  })
).min(1, 'varukorgen är tom').max(50, 'för många olika produkter')

// Slår ihop dubbletter, hämtar priser och saldo från databasen och räknar ut varusumman i ören
export async function priceCart(db, items, { checkStock = false } = {}) {
  const wanted = new Map()
  for (const item of items) {
    wanted.set(item.product_id, (wanted.get(item.product_id) ?? 0) + item.quantity)
  }

  const { rows } = await db.query(
    'SELECT id, name, price, stock FROM products WHERE id = ANY($1) AND is_active = true',
    [[...wanted.keys()]]
  )
  const byId = new Map(rows.map(p => [Number(p.id), p]))

  const lines = []
  for (const [productId, quantity] of wanted) {
    const product = byId.get(productId)
    if (!product) throw new CartError('En av produkterna i varukorgen finns inte längre', 400)
    // Saldot kontrolleras när ordern skapas, så att en produkt med för lågt saldo inte kan köpas
    if (checkStock && Number(product.stock) < quantity) {
      throw new CartError(`Det finns bara ${product.stock} st av "${product.name}" i lager`, 409)
    }
    lines.push({
      productId,
      name: product.name,
      quantity,
      // Räknar i ören (heltal) för att undvika avrundningsfel
      unitAmountOre: Math.round(Number(product.price) * 100)
    })
  }

  const goodsOre = lines.reduce((sum, l) => sum + l.unitAmountOre * l.quantity, 0)
  return { lines, goodsOre }
}