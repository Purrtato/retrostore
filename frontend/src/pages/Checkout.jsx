import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { api } from '../api'

function formatEstimate(estimate) {
  if (!estimate) return null
  if (estimate.date) {
    const day = new Date(`${estimate.date}T12:00:00`).toLocaleDateString('sv-SE', {
      weekday: 'long', day: 'numeric', month: 'numeric'
    })
    return `Beräknad leverans: ${day}`
  }
  if (estimate.daysMin != null && estimate.daysMax != null) {
    return `Beräknad leverans: ${estimate.daysMin}–${estimate.daysMax} dagar`
  }
  return null
}

function formatDistance(meters) {
  if (meters == null) return ''
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

function Checkout() {
  const { cart, notices, refreshStock } = useCart()

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [shippingOption, setShippingOption] = useState('pickup') // 'pickup' (ombud) eller 'home' (hemleverans)
  const [servicePointId, setServicePointId] = useState('')

  const [quote, setQuote] = useState(null)       // fraktpriser och varusumma från servern
  const [quoteError, setQuoteError] = useState('')
  const [lookup, setLookup] = useState(null)     // ombud och leveranstid för postnumret
  const [lookingUp, setLookingUp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Skickar bara produkt-id och antal till servern, aldrig några priser
  const items = cart.map(item => ({ product_id: item.id, quantity: item.quantity }))
  const itemsKey = JSON.stringify(items)

  // Kontrollerar lagersaldot en gång när kassan öppnas, så att kunden får veta om något är slut innan hen fyller i uppgifter
  useEffect(() => {
    refreshStock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hämtar fraktpriserna från servern när varukorgen ändras. Servern räknar ut varusumman från databasen
  useEffect(() => {
    if (itemsKey === '[]') return
    let cancelled = false
    api('/api/shipping/quote', { method: 'POST', body: { items: JSON.parse(itemsKey) } })
      .then(data => {
        if (cancelled) return
        setQuote(data)
        setQuoteError('')
      })
      .catch(err => {
        if (cancelled) return
        setQuoteError(err.status ? err.message : 'Kunde inte nå servern, försök igen om en stund')
      })
    return () => { cancelled = true }
  }, [itemsKey])

  const normalizedPostal = postalCode.replace(/\s+/g, '')
  const postalValid = /^\d{5}$/.test(normalizedPostal)

  function handlePostalChange(e) {
    setPostalCode(e.target.value)
    setLookup(null)        // Gamla ombud gäller inte längre för ett nytt postnummer
    setServicePointId('')
  }

  // Hämtar ombud och leveranstid för postnumret, (körs när kunden trycker på knappen)
  async function handleLookup() {
    if (!postalValid) {
      setLookup({ servicePoints: [], pointsError: 'Skriv ett postnummer med fem siffror', estimate: null })
      return
    }
    setLookingUp(true)
    setLookup(null)
    setServicePointId('')

    const query = `postalCode=${encodeURIComponent(normalizedPostal)}`
    // allSettled, om leveranstiden misslyckas ska ombuden ändå visas och tvärtom
    const [points, estimate] = await Promise.allSettled([
      api(`/api/shipping/service-points?${query}`),
      api(`/api/shipping/estimate?${query}`)
    ])

    setLookup({
      servicePoints: points.status === 'fulfilled' ? points.value.items : [],
      pointsError: points.status === 'rejected'
        ? (points.reason.status ? points.reason.message : 'Kunde inte nå servern, försök igen om en stund')
        : '',
      estimate: estimate.status === 'fulfilled' ? estimate.value : null
    })
    setLookingUp(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      // Skickar produkter, antal, kunduppgifter och leveransval. Servern räknar ut alla priser
      const { url } = await api('/api/checkout', {
        method: 'POST',
        body: {
          customer_name: customerName,
          customer_email: customerEmail,
          items,
          shipping_option: shippingOption,
          postal_code: normalizedPostal,
          ...(shippingOption === 'pickup' ? { service_point_id: servicePointId } : {})
        }
      })
      window.location.href = url // vidare till Stripes betalsida
    } catch (err) {
      setError(err.status ? err.message : 'Kunde inte nå servern, försök igen om en stund')
      setSubmitting(false)
      // Slut i lager (409) eller en vara som försvunnit (400): uppdatera korgen
      if (err.status === 409 || err.status === 400) refreshStock()
    }
  }

  // Tom korg. Har kontrollen av lagersaldot tagit bort varor förklaras det varför
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <div className="max-w-3xl mx-auto text-center pt-10">
          {notices.map(notice => (
            <p key={notice} className="text-amber-400 mb-3">{notice}</p>
          ))}
          <p className="text-slate-400 mb-4">Din varukorg är tom.</p>
          <Link to="/" className="text-emerald-400 hover:underline">Tillbaka till produkter</Link>
        </div>
      </div>
    )
  }

  const selected = quote?.options.find(option => option.id === shippingOption)
  // Avrundar till två decimaler
  const total = quote && selected ? Math.round((quote.goods_total + selected.price) * 100) / 100 : null
  // Ombud kräver ett valt ombud, hemleverans räcker med ett giltigt postnummer
  const canPay = Boolean(quote && selected && postalValid && (shippingOption === 'home' || servicePointId))

  const inputClass =
    'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none'

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Checkout</h1>

        <div className="grid md:grid-cols-2 gap-8 min-w-0">

          {/* Vänster kolumn, uppgifter, frakt och betalning */}
          <div>
            {notices.map(notice => (
              <p key={notice} className="text-amber-400 mb-3">{notice}</p>
            ))}
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Namn"
                className={inputClass}
                required
              />
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="E-post"
                className={inputClass}
                required
              />

              {/* Postnummer och sökning av ombud */}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={postalCode}
                  onChange={handlePostalChange}
                  placeholder="Postnummer"
                  className={inputClass}
                  required
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={lookingUp}
                  className="bg-slate-700 text-slate-200 px-4 rounded-lg hover:bg-slate-600 disabled:opacity-50 whitespace-nowrap"
                >
                  {lookingUp ? 'Söker...' : 'Visa ombud och leverans'}
                </button>
              </div>

              {/* Fraktalternativ med pris och leveranstid */}
              {quoteError && <p className="text-red-400">{quoteError}</p>}
              {quote && (
                <div className="space-y-2">
                  <h2 className="text-white font-semibold">Frakt</h2>
                  {quote.options.map(option => {
                    const estimateText = formatEstimate(lookup?.estimate?.[option.id])
                    return (
                      <label
                        key={option.id}
                        className="flex items-start gap-3 bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="shipping"
                          value={option.id}
                          checked={shippingOption === option.id}
                          onChange={() => setShippingOption(option.id)}
                          className="mt-1"
                        />
                        <span className="flex-1">
                          <span className="text-white">{option.label}</span>
                          <span className="text-emerald-400 ml-2">
                            {option.free ? 'Gratis' : `${option.price} kr`}
                          </span>
                          {estimateText && <span className="block text-sm text-slate-400">{estimateText}</span>}
                        </span>
                      </label>
                    )
                  })}
                  {selected && !selected.free && (
                    <p className="text-xs text-slate-500">Fri frakt från {quote.free_shipping_from} kr.</p>
                  )}
                </div>
              )}

              {/* Ombud att välja bland (bara vid ombud) */}
              {shippingOption === 'pickup' && (
                <div className="space-y-2">
                  <h2 className="text-white font-semibold">Välj ombud</h2>
                  {!lookup && (
                    <p className="text-sm text-slate-400">
                      Skriv ditt postnummer och tryck på "Visa ombud och leverans".
                    </p>
                  )}
                  {lookup?.pointsError && <p className="text-red-400">{lookup.pointsError}</p>}
                  {lookup && !lookup.pointsError && lookup.servicePoints.length === 0 && (
                    <p className="text-slate-400">Inga ombud hittades för postnumret.</p>
                  )}
                  {lookup?.servicePoints.map(point => (
                    <label
                      key={point.id}
                      className="flex items-start gap-3 bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="servicePoint"
                        value={point.id}
                        checked={servicePointId === point.id}
                        onChange={() => setServicePointId(point.id)}
                        className="mt-1"
                      />
                      <span className="flex-1 text-sm">
                        <span className="block text-white">{point.name}</span>
                        <span className="block text-slate-400">
                          {point.street}, {point.postalCode} {point.city}
                          {point.distanceMeters != null && ` · ${formatDistance(point.distanceMeters)}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {error && <p className="text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !canPay}
                className="bg-emerald-500 text-slate-900 font-semibold px-4 py-3 rounded-lg hover:bg-emerald-400 transition-colors w-full disabled:opacity-50"
              >
                {submitting
                  ? 'Skickar dig till betalningen...'
                  : total != null ? `Gå till betalning (${total} kr)` : 'Gå till betalning'}
              </button>
              <p className="text-xs text-slate-500">
                Du betalar på Stripes säkra sida. Vi hanterar aldrig dina kortuppgifter.
              </p>
            </form>
          </div>

          {/* Höger kolumn, ordersammanfattning (priserna kommer från servern) */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 h-fit min-w-0">
            <h2 className="text-lg font-semibold text-white mb-4">Din order</h2>
            <ul className="space-y-3 mb-4">
              {cart.map(item => (
                <li key={item.id} className="flex justify-between gap-2 text-sm min-w-0">
                  <span className="text-slate-300 truncate min-w-0">{item.name} x {item.quantity}</span>
                </li>
              ))}
            </ul>
            {quote && selected && (
              <div className="border-t border-slate-700 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Varor</span>
                  <span>{quote.goods_total} kr</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Frakt ({selected.label})</span>
                  <span>{selected.free ? '0 kr' : `${selected.price} kr`}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-white font-semibold">Totalt</span>
                  <span className="text-emerald-400 font-bold text-lg">{total} kr</span>
                </div>
              </div>
            )}
            <Link to="/cart" className="text-sm text-emerald-400 hover:underline block mt-4">
              Ändra varukorgen
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Checkout