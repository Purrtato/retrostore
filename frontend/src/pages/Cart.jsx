import { useEffect } from 'react'
import { useCart } from '../context/CartContext'
import { Link } from 'react-router-dom'

function Cart() {
  // Hämtar varukorgens innehåll och funktionerna från Context
  const { cart, notices, removeFromCart, updateQuantity, refreshStock } = useCart()

  // Kontrollerar saldot mot servern när varukorgen öppnas
  useEffect(() => {
    refreshStock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Räknar ut totalsumman genom att summera pris * antal för varje rad
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Varukorg</h1>

        {/* Förklarar ändringar som gjorts, t.ex. att en vara tagits bort för att den är slut */}
        {notices.map(notice => (
          <p key={notice} className="text-amber-400 mb-3">{notice}</p>
        ))}

        {cart.length === 0 ? (
          <p className="text-slate-400">Din varukorg är tom.</p>) : (
          <div className="grid md:grid-cols-2 gap-8">

            {/* Vänster kolumn, varorna */}
            <ul className="space-y-3">
              {cart.map(item => {
                // Har antalet nått lagersaldot går det inte att öka mer
                const maxReached = item.quantity >= Number(item.stock)

                return (
                  <li
                    key={item.id}
                    className="bg-slate-800 border border-slate-700 p-4 rounded-xl"
                  >
                    <span className="text-white block mb-2">{item.name}</span>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="bg-slate-700 text-white w-7 h-7 rounded-md hover:bg-slate-600 disabled:opacity-40">
                          -
                        </button>
                        <span className="text-white w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={maxReached}
                          className="bg-slate-700 text-white w-7 h-7 rounded-md hover:bg-slate-600 disabled:opacity-40">
                          +
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-emerald-400 font-semibold whitespace-nowrap">{Number(item.price) * item.quantity} kr</span>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-400 hover:text-red-300 text-sm">
                          Ta bort
                        </button>
                      </div>
                    </div>

                    {/* Förklarar varför plus-knappen är avstängd */}
                    {maxReached && (
                      <p className="text-xs text-slate-500 mt-2">Max antal, det finns {item.stock} i lager.</p>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Höger kolumn, sammanfattning */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 h-fit">
              <h2 className="text-lg font-semibold text-white mb-4">Sammanfattning</h2>

              {/* Rabattkod, bara för utseende ingen funktion bakom */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Rabattkod"
                  className="bg-slate-900 border border-slate-700 text-white placeholder-slate-500 p-2 rounded-lg text-sm flex-1 focus:border-emerald-400 focus:outline-none"
                />
                <button className="bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm hover:bg-slate-600 transition-colors">
                  Tillämpa
                </button>
              </div>

              <div className="border-t border-slate-700 pt-3 flex justify-between mb-5">
                <span className="text-white font-semibold">Varor</span>
                <span className="text-emerald-400 font-bold text-lg">{total} kr</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">Frakt läggs till i kassan.</p>

              <Link
                to="/checkout"
                className="bg-emerald-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors w-full inline-block text-center"
              >
                Gå till checkout
              </Link>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

export default Cart