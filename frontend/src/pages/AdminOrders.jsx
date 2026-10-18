import { useState, useEffect } from 'react'
import { api } from '../api'

function AdminOrders() {
  // Listan med alla ordrar, hämtade från backend
  const [orders, setOrders] = useState([])
  // Felmeddelande att visa om hämtningen misslyckas (t.ex. 401 om sessionen gått ut)
  const [error, setError] = useState('')

  useEffect(() => {
    // api() skickar med session-cookien och kastar ett fel om servern svarar med t.ex. 401
    api('/orders')
      .then(data => setOrders(data))
      .catch(err => setError(err.message))
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Admin - Ordrar</h1>

        {/* Visa felet i stället för att krascha */}
        {error && <p className="text-red-400 mb-4">{error}</p>}

        <ul className="space-y-3">
          {orders.map(order => (
            <li key={order.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="font-semibold text-white">Order #{order.id} - {order.customer_name}</p>
              <p className="text-sm text-slate-400">{order.customer_email}</p>
              <p className="text-sm text-emerald-400 mb-2">Status: {order.status}</p>

              <ul className="text-sm text-slate-300 ml-4 mb-2 list-disc space-y-1">
                {order.items.map((item, index) => (
                  <li key={index}>
                    {item.product_name} x {item.quantity} - {item.price_at_purchase * item.quantity} kr
                  </li>
                ))}
              </ul>

              <p className="text-sm font-semibold text-white">Totalt: {order.total} kr</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default AdminOrders