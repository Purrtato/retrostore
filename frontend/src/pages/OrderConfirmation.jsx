import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { api } from '../api'

const POLL_INTERVAL_MS = 2000 // fråga servern var 2:a sekund
const MAX_ATTEMPTS = 15       // ge upp efter ca 30 sekunder

function OrderConfirmation() {
  const { clearCart } = useCart()
  // Stripe skickar tillbaka kunden
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [state, setState] = useState({ order: null, error: '', gaveUp: false })

  // Hämtar ordern, och frågar igen så länge den väntar på betalningen
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false // ignorera svar om sidan lämnats
    let timer
    let attempts = 0

    async function load() {
      try {
        const order = await api(`/api/checkout/order/${sessionId}`)
        if (cancelled) return
        attempts++
        // 'Obetald' = webhooken har inte hunnit komma än, så vi väntar och frågar igen
        const waiting = order.status === 'Obetald'
        const gaveUp = waiting && attempts >= MAX_ATTEMPTS
        setState({ order, error: '', gaveUp })
        if (waiting && !gaveUp) timer = setTimeout(load, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        setState({
          order: null,
          error: err.status ? err.message : 'Kunde inte nå servern, försök igen om en stund',
          gaveUp: false
        })
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId])

  // Tömmer varukorgen en gång, när servern har bekräftat att ordern är betald
  const status = state.order?.status
  const cleared = useRef(false)
  useEffect(() => {
    if (status === 'Betald' && !cleared.current) {
      cleared.current = true
      clearCart()
    }
  }, [status, clearCart])

  const { order, error, gaveUp } = state

  // Ingen session i adressen: kunden har hamnat här på fel sätt
  const message = !sessionId ? 'Ingen orderinformation hittades.' : error

  if (message) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">{message}</p>
          <Link to="/" className="text-emerald-400 hover:underline">Tillbaka till produkter</Link>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <p className="text-slate-400">Hämtar din order...</p>
      </div>
    )
  }

  // Rubrik och text beroende på orderns status (som alltid kommer från servern)
  const heading = {
    Betald: 'Tack för din order! 🎉',
    Obetald: 'Vi bekräftar din betalning...',
    Avbruten: 'Betalningen avbröts'
  }[order.status] ?? 'Din order'

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex items-start justify-center pt-16">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white mb-1">{heading}</h1>
        <p className="text-slate-400">Ordernummer: #{order.id}</p>
        <p className="text-sm text-emerald-400 mb-5">Status: {order.status}</p>

        {order.status === 'Obetald' && !gaveUp && (
          <p className="text-slate-400 text-sm mb-4">Det kan ta några sekunder. Stäng inte sidan.</p>
        )}
        {gaveUp && (
          <p className="text-amber-400 text-sm mb-4">
            Betalningen är inte bekräftad än. Ladda om sidan om en stund.
          </p>
        )}
        {order.status === 'Avbruten' && (
          <p className="text-slate-400 text-sm mb-4">Ordern är avbruten och ingen betalning har gjorts.</p>
        )}

        <ul className="space-y-2 mb-4">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-2 text-sm border-b border-slate-700 pb-2">
              <span className="text-slate-300 truncate">{item.product_name} x {item.quantity}</span>
              <span className="text-white whitespace-nowrap">{item.price_at_purchase * item.quantity} kr</span>
            </li>
          ))}
        </ul>

        <p className="text-lg font-bold text-white mb-5">Totalt: {order.total} kr</p>

        <Link to="/" className="text-emerald-400 hover:underline">Tillbaka till produkter</Link>
      </div>
    </div>
  )
}

export default OrderConfirmation