import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  // loading är true tills vi har frågat servern, så att vi inte blinkar fram inloggningssidan i onödan
  const [loading, setLoading] = useState(true)

  // Vid sidladdning, fråga servern om vi redan har en giltig session
  useEffect(() => {
    api('/auth/me')
      .then(data => setIsAdmin(data.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false))
  }, [])

  async function login(username, password) {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } })
    setIsAdmin(data.isAdmin)
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    setIsAdmin(false)
  }

  return (
    <AuthContext.Provider value={{ isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook så att komponenter kan göra: const { isAdmin, login } = useAuth()
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}