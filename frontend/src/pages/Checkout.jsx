import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { api } from '../api'

function Checkout() {
  const { cart } = useCart()

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [submitting, setSubmitting] = useState(false) // stänger av knappen så att man inte klickar två gånger
  const [error, setError] = useState('')

  // Bara för visning. Det riktiga priset räknas alltid ut av servern.
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      // Vi skickar bara vilka produkter och hur många, aldrig några priser
      const { url } = await api('/api/checkout', {
        method: 'POST',
        body: {
          customer_name: customerName,
          customer_email: customerEmail,
          items: cart.map(item => ({ product_id: item.id, quantity: item.quantity }))
        }
      })

      // Skicka kunden till Stripes betalsida. Det är en riktig sidladdning
      window.location.href = url
    } catch (err) {
      // Saknas status gick det inte att nå servern alls.
      setError(err.status ? err.message : 'Kunde inte nå servern, försök igen om en stund')
      setSubmitting(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <p className="text-slate-400">Din varukorg är tom.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Checkout</h1>

        <div className="grid md:grid-cols-2 gap-8 min-w-0">

          {/* Vänster kolumn, formuläret */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Namn"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
                required
              />
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="E-post"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
                required
              />

              {error && <p className="text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="bg-emerald-500 text-slate-900 font-semibold px-4 py-3 rounded-lg hover:bg-emerald-400 transition-colors w-full disabled:opacity-50"
              >
                {submitting ? 'Skickar dig till betalningen...' : `Gå till betalning (${total} kr)`}
              </button>
              <p className="text-xs text-slate-500">
                Du betalar på Stripes säkra sida. Vi hanterar aldrig dina kortuppgifter.
              </p>
            </form>
          </div>

          {/* Höger kolumn, ordersammanfattning */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 h-fit min-w-0">
            <h2 className="text-lg font-semibold text-white mb-4">Din order</h2>
            <ul className="space-y-3 mb-4">
              {cart.map(item => (
                <li key={item.id} className="flex justify-between gap-2 text-sm min-w-0">
                  <span className="text-slate-300 truncate min-w-0">{item.name} x {item.quantity}</span>
                  <span className="text-white whitespace-nowrap shrink-0">{item.price * item.quantity} kr</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-700 pt-3 flex justify-between">
              <span className="text-white font-semibold">Totalt</span>
              <span className="text-emerald-400 font-bold text-lg">{total} kr</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Checkout