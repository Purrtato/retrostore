import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { CustomerProvider } from './context/CustomerContext.jsx'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* AuthProvider omsluter allt som behöver veta om admin är inloggad */}
      <AuthProvider>
        <CustomerProvider>
        <CartProvider>
          <App />
        </CartProvider>
        </CustomerProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)