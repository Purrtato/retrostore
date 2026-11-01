import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

// Skapar innehållet som alla komponenter kan hämta varukorgen ur utan att den behöver skickas manuellt genom varje mellanliggande komponent
const CartContext = createContext()

// Nyckeln varukorgen sparas under i webbläsaren
const CART_KEY = 'retrostore-cart'

// Läser den sparade varukorgen
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY))
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

// CartProvider håller själva datan och delar ut den till allt som ligger "inuti" den
export function CartProvider({ children }) {
  // En array med produkter som lagts till 
  const [cart, setCart] = useState(loadCart)

  // Meddelanden om ändringar som gjorts i korgen efter en kontroll mot lagersaldot
  const [notices, setNotices] = useState([])

  // Sparar varukorgen varje gång den ändras, så att den överlever att kunden besöker Stripe och kommer tillbaka
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch {
      // Lagringen kan vara avstängd eller full. Då fungerar korgen som förut, utan att sparas
    }
  }, [cart])

  // Hur många av en produkt som ligger i korgen just nu
  function quantityInCart(id) {
    return cart.find(item => item.id === id)?.quantity ?? 0
  }

  // Lägger till en produkt i varukorgen. Returnerar false om det inte gick (slut i lager eller max antal).
  function addToCart(product) {
    const stock = Number(product.stock)
    // Slut i lager, eller så många som finns ligger redan i korgen
    if (Number.isFinite(stock) && quantityInCart(product.id) >= stock) return false

    setCart(prev => {
      // Kollar om produkten redan finns i korgen
      const existing = prev.find(item => item.id === product.id)

      if (existing) {
        // Finns den redan öka bara "quantity" med 1 på den raden
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }

      // Finns den inte lägg till den som ny rad med quantity: 1
      return [...prev, { ...product, quantity: 1 }]
    })
    return true
  }

  // Tar bort en produkt helt från varukorgen
  function removeFromCart(id) {
    setCart(prev => prev.filter(item => item.id !== id))
  }

  // Ändrar antalet av en specifik produkt, men aldrig över lagersaldot
  function updateQuantity(id, newQuantity) {
    if (newQuantity < 1) return // tillåt aldrig 0 eller negativt

    setCart(prev =>
      prev.map(item => {
        if (item.id !== id) return item
        const stock = Number(item.stock)
        const max = Number.isFinite(stock) ? stock : Infinity
        return { ...item, quantity: Math.max(1, Math.min(newQuantity, max)) }
      })
    )
  }

  // Tömmer hela varukorgen (körs efter ett lyckat köp)
  function clearCart() {
    setCart([])
  }

  // Jämför varukorgen med de aktuella saldona från servern
  async function refreshStock() {
    let products
    try {
      products = await api('/products')
    } catch {
      return // går det inte att hämta saldot kontrollerar servern ändå vid betalning
    }

    const byId = new Map(products.map(product => [product.id, product]))
    const next = []
    const found = []

    for (const item of cart) {
      const fresh = byId.get(item.id)
      const stock = fresh ? Number(fresh.stock) : 0

      if (!fresh || stock <= 0) {
        found.push(`"${item.name}" är slut i lager och har tagits bort från varukorgen.`)
        continue
      }
      const quantity = Math.min(item.quantity, stock)
      if (quantity < item.quantity) {
        found.push(`Antalet av "${item.name}" har sänkts till ${quantity}, eftersom det är så många som finns i lager.`)
      }
      // Uppdaterar också saldo och pris, så att korgen visar det som gäller nu
      next.push({ ...item, quantity, stock, price: fresh.price })
    }

    setCart(next)
    setNotices(found)
  }

  return (
    <CartContext.Provider
      value={{
        cart, notices, addToCart, removeFromCart, clearCart, updateQuantity, quantityInCart, refreshStock
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

// Genväg för att komma åt varukorgen från vilken komponent som helst
export function useCart() {
  return useContext(CartContext)
}