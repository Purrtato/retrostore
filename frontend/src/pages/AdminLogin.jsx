import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminLogin() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault() // hindra att sidan laddas om
    setError('')
    try {
      await login(username, password)
      navigate('/admin/products')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-20 flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Admin login</h1>
      <input
        className="rounded border p-2"
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
      />
      <input
        className="rounded border p-2"
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      {error && <p className="text-red-600">{error}</p>}
      <button className="rounded bg-black p-2 text-white" type="submit">
        Log in
      </button>
    </form>
  )
}