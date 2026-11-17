import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const CustomerContext = createContext(null)

// Håller reda på vilken kund som är inloggad (via shoppens session-cookie)
export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  // Vid sidladdning, fråga servern om det finns en inloggad kund
  useEffect(() => {
    api('/customer/me')
      .then(data => setCustomer(data.customer))
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false))
  }, [])

  async function logout() {
    await api('/customer/logout', { method: 'POST' })
    setCustomer(null)
  }

  return (
    <CustomerContext.Provider value={{ customer, loading, logout }}>
      {children}
    </CustomerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCustomer() {
  return useContext(CustomerContext)
}