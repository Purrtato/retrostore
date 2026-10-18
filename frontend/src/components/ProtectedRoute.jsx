import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Omsluter sidor som bara admin ska se: <ProtectedRoute><AdminPage /></ProtectedRoute>
export default function ProtectedRoute({ children }) {
  const { isAdmin, loading } = useAuth()

  // Vi väntar på svaret från /auth/me, annars skulle du skickas till login en kort stund även när du faktiskt är inloggad
  if (loading) return <p>Loading...</p>

  // Inte inloggad, skicka till inloggningssidan.
  // replace gör att "tillbaka"-knappen inte hamnar i en loop.
  if (!isAdmin) return <Navigate to="/admin/login" replace />

  // Inloggad: visa sidan som skickades in som children
  return children
}