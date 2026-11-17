import { Navigate, useSearchParams } from 'react-router-dom'
import { useCustomer } from '../context/CustomerContext'
import { API_URL } from '../config'

// Felkoder från servern
const ERROR_MESSAGES = {
  cancelled: 'Inloggningen avbröts. Du kan försöka igen när du vill.',
  invalid_state: 'Inloggningen kunde inte verifieras (den kan ha gått ut). Försök igen.',
  invalid_token: 'Svaret från Google kunde inte verifieras. Försök igen.',
  google_unavailable: 'Google svarar inte just nu. Försök igen om en stund.',
  unverified_email: 'Ditt Google-konto saknar en verifierad e-postadress.',
  failed: 'Något gick fel vid inloggningen. Försök igen.'
}

function Login() {
  const { customer, loading } = useCustomer()
  const [searchParams] = useSearchParams()
  const errorCode = searchParams.get('error')
  const message = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.failed) : ''

  if (!loading && customer) return <Navigate to="/mina-sidor" replace />

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex items-start justify-center pt-16">
      <div className="max-w-sm w-full bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white mb-2">Logga in</h1>
        <p className="text-slate-400 text-sm mb-5">
          Logga in för att se dina beställningar. Vi frågar bara efter ditt namn och din e-postadress.
        </p>

        {message && <p className="text-red-400 mb-4">{message}</p>}

        {/* En vanlig länk till vår server (inte ett fetch-anrop), eftersom webbläsaren ska skickas vidare till Google */}
        <a
          href={`${API_URL}/auth/google/start`}
          className="block text-center bg-white text-slate-900 font-semibold px-4 py-3 rounded-lg hover:bg-slate-200 transition-colors"
        >
          Logga in med Google
        </a>
      </div>
    </div>
  )
}

export default Login