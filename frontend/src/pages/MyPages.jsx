import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useCustomer } from '../context/CustomerContext'
import { api } from '../api'

function MyPages() {
  const { customer, loading, logout } = useCustomer()
  const navigate = useNavigate()
  const [state, setState] = useState({ orders: null, error: '' })

  // Hämtar kundens egna beställningar
  useEffect(() => {
    if (!customer) return
    let cancelled = false
    api('/customer/orders')
      .then(data => { if (!cancelled) setState({ orders: data.orders, error: '' }) })
      .catch(err => {
        if (cancelled) return
        setState({ orders: null, error: err.status ? err.message : 'Kunde inte nå servern, försök igen om en stund' })
      })
    return () => { cancelled = true }
  }, [customer])

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  if (loading) return <p className="p-6 text-slate-400">Laddar...</p>
  // Inte inloggad, skicka till inloggningen (det riktiga skyddet är 401 från servern)
  if (!customer) return <Navigate to="/login" replace />

  const { orders, error } = state

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Mina sidor</h1>
            <p className="text-slate-400 text-sm">Inloggad som {customer.name} ({customer.email})</p>
          </div>
          <button onClick={handleLogout} className="bg-slate-700 text-slate-200 px-4 py-2 rounded-lg hover:bg-slate-600">
            Logga ut
          </button>
        </div>

        <h2 className="text-lg font-semibold text-white mb-3">Dina beställningar</h2>

        {error && <p className="text-red-400">{error}</p>}
        {!error && orders === null && <p className="text-slate-400">Hämtar beställningar...</p>}
        {orders && orders.length === 0 && <p className="text-slate-400">Du har inga beställningar än.</p>}

        <ul className="space-y-3">
          {orders?.map(order => (
            <li key={order.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="font-semibold text-white">
                Order #{order.id} · {new Date(order.created_at).toLocaleDateString('sv-SE')}
              </p>
              <p className="text-sm text-emerald-400 mb-2">Status: {order.status}</p>

              <ul className="text-sm text-slate-300 ml-4 mb-2 list-disc space-y-1">
                {order.items.map((item, index) => (
                  <li key={index}>
                    {item.product_name} x {item.quantity} – {item.price_at_purchase * item.quantity} kr
                  </li>
                ))}
              </ul>

              {order.shipping_option && (
                <p className="text-sm text-slate-400">
                  Frakt: {order.shipping_option === 'pickup' ? 'Ombud' : 'Hemleverans'}
                  {' – '}{order.shipping_price === 0 ? 'Gratis' : `${order.shipping_price} kr`}
                  {order.service_point_name && ` (${order.service_point_name}, ${order.service_point_address})`}
                </p>
              )}
              <p className="text-sm font-semibold text-white mt-1">Totalt: {order.total} kr</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default MyPages