import { useState, useEffect } from 'react'
import { api } from '../api'

const PAGE_SIZE = 12

function Search() {
  const [input, setInput] = useState('')   // det som står i sökfältet just nu
  const [query, setQuery] = useState('')   // söktexten vi faktiskt söker på
  const [page, setPage] = useState(1)

  // Sparar det senaste svaret tillsammans med nyckeln för sökningen det hör till.
  // loading och error räknas ut från detta (se längre ner), så vi slipper sätta dem i effekten.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })

  // Nyckel för den sökning vi vill visa just nu
  const key = `${query}|${page}`

  // Vänta 300 ms efter sista tangenttryckningen innan vi söker, så att vi inte
  // anropar servern för varje bokstav. En ny sökning börjar alltid på sida 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer) // rensa timern om man skriver vidare
  }, [input])

  // Körs när söktexten eller sidan ändras
  useEffect(() => {
    let cancelled = false // ignorera svar från en sökning som redan är inaktuell

    const params = new URLSearchParams({
      q: query,
      page: String(page),
      pageSize: String(PAGE_SIZE)
    })

    api(`/api/search?${params}`)
      .then(data => {
        if (!cancelled) setResponse({ key, data, error: '' })
      })
      .catch(err => {
        if (cancelled) return
        // Serverfel har ett eget meddelande. Saknas status gick det inte ens att nå servern.
        const message = err.status
          ? err.message
          : 'Kunde inte nå servern, försök igen om en stund'
        setResponse({ key, data: null, error: message })
      })

    return () => { cancelled = true }
  }, [query, page, key])

  // Härlett från state, inte egna states:
  const loading = response.key !== key                 // svaret hör inte till den aktuella sökningen än
  const error = loading ? '' : response.error          // visa bara felet när det gäller den aktuella sökningen
  const result = response.data                         // tidigare träffar syns medan nya laddas

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Sök produkter</h1>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Sök efter produkt, t.ex. hörlurar"
          className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full mb-4 focus:border-emerald-400 focus:outline-none"
        />

        {error && <p className="text-red-400 mb-4">{error}</p>}

        {result && (
          <p className="text-slate-400 mb-4">
            {result.total} {result.total === 1 ? 'träff' : 'träffar'}
            {loading && ' · söker...'}
          </p>
        )}

        {result && result.items.length === 0 && !error && (
          <p className="text-slate-300">Inga produkter matchade sökningen.</p>
        )}

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {result?.items.map(item => (
            <li key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              {item.image_url && (
                <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover rounded-lg mb-3" />
              )}
              <p className="font-semibold text-white">{item.name}</p>
              <p className="text-sm text-slate-400">{item.category}</p>
              <p className="text-emerald-400 font-semibold mt-1">{item.price} kr</p>
              <p className="text-sm text-slate-400">
                {item.stock > 0 ? `${item.stock} i lager` : 'Slut i lager'}
              </p>
            </li>
          ))}
        </ul>

        {/* Bläddring mellan sidor */}
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6 text-slate-300">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1}
              className="bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 disabled:opacity-40"
            >
              Föregående
            </button>
            <span>Sida {result.page} av {result.totalPages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= result.totalPages}
              className="bg-slate-700 px-4 py-2 rounded-lg hover:bg-slate-600 disabled:opacity-40"
            >
              Nästa
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Search