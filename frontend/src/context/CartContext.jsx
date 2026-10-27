import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext()

// Nyckeln varukorgen sparas under i webbläsaren
const CART_KEY = 'retrostore-cart'

// Läser den sparade varukorgen. Är något trasigt eller saknas börjar vi med en tom korg.
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY))
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  // Funktionen som skickas till useState körs bara första gången, så vi läser inte localStorage vid varje rendering
  const [cart, setCart] = useState(loadCart)

  // Sparar varukorgen varje gång den ändras, så att den överlever att kunden besöker Stripe och kommer tillbaka
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart))
    } catch {
      // Lagringen kan vara avstängd eller full. Då fungerar korgen som förut, utan att sparas.
    }
  }, [cart])

  // Lägger till en produkt i varukorgen
  function addToCart(product) {
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
  }

  // Tar bort en produkt helt från varukorgen
  function removeFromCart(id) {
    setCart(prev => prev.filter(item => item.id !== id))
  }

  // Ändrar antalet av en specifik produkt i varukorgen
  function updateQuantity(id, newQuantity) {
    if (newQuantity < 1) return // tillåt aldrig 0 eller negativt

    setCart(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity: newQuantity } : item
      )
    )
  }

  // Tömmer hela varukorgen (körs efter ett lyckat köp i checkout)
  function clearCart() {
    setCart([])
  }

  // Delar ut cart, addToCart, removeFromCart och clearCart till alla children
  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, updateQuantity }}>
      {children}
    </CartContext.Provider>
  )
}

// Genväg för att komma åt varukorgen från vilken komponent som helst
export function useCart() {
  return useContext(CartContext)
}