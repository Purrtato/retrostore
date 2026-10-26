import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'

function Navbar() {
  // Hämtar varukorgen för att kunna visa antal varor i menyn
  const { cart } = useCart()

  // Hämtar inloggningsstatus och logout-funktionen
  const { isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  // Räknar ihop totalt antal varor
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  // Loggar ut och skickar användaren till startsidan
  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-slate-950 border-b border-slate-800">
      <Link to="/" className="text-xl font-bold text-white tracking-tight">
        Retro<span className="text-emerald-400">Store</span>
      </Link>
      <div className="flex flex-wrap items-center gap-6">
        <Link to="/" className="text-slate-300 hover:text-emerald-400 transition-colors">
          Produkter
        </Link>
        <Link to="/search" className="text-slate-300 hover:text-emerald-400 transition-colors">
          Sök
        </Link>
        <Link to="/cart" className="text-slate-300 hover:text-emerald-400 transition-colors">
          Varukorg {itemCount > 0 && <span className="text-emerald-400 font-semibold">({itemCount})</span>}
        </Link>

        {isAdmin ? (
          <>
            {/* Visas bara för inloggad admin */}
            <Link to="/admin/products" className="text-slate-300 hover:text-emerald-400 transition-colors">
              Admin
            </Link>
            <Link to="/admin/orders" className="text-slate-300 hover:text-emerald-400 transition-colors">
              Ordrar
            </Link>
            <button
              onClick={handleLogout}
              className="text-slate-300 hover:text-emerald-400 transition-colors"
            >
              Logga ut
            </button>
          </>
        ) : (
          // Utloggad: bara en inloggningslänk
          <Link to="/admin/login" className="text-slate-300 hover:text-emerald-400 transition-colors">
            Admin login
          </Link>
        )}
      </div>
    </nav>
  )
}

export default Navbar