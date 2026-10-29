import { useState } from 'react'
import { api } from '../api'

// Visar produktens nuvarande bild och låter admin ladda upp en ny
function ProductImageUpload({ product, onDone }) {
  const [file, setFile] = useState(null)
  const [inputKey, setInputKey] = useState(0) // byts för att tömma filväljaren efter uppladdning
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    setMessage('')
    setWarning('')

    // FormData är det som skickar själva filen. Fältnamnet "image" måste matcha servern.
    const form = new FormData()
    form.append('image', file)

    try {
      const data = await api(`/admin/products/${product.id}/image`, { method: 'POST', body: form })
      setMessage('Bilden är uppladdad.')
      setWarning(data.searchIndexWarning || '')
      setFile(null)
      setInputKey(k => k + 1)
      onDone?.() // hämta produktlistan på nytt så att den nya bilden syns
    } catch (err) {
      // Servern ger fel, t.ex. "Filen måste vara en JPEG- eller PNG-bild".
      // Saknas status gick det inte att nå servern alls.
      setError(err.status ? err.message : 'Kunde inte nå servern, försök igen om en stund')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-6 max-w-sm">
      <h3 className="text-md font-semibold text-white mb-2">Produktbild</h3>

      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="w-full h-40 object-cover rounded-lg mb-3" />
      ) : (
        <p className="text-slate-400 text-sm mb-3">Ingen bild uppladdad än.</p>
      )}

      {/* Den riktiga filväljaren är gömd, och etiketten fungerar som knapp.
          Ett klick på etiketten öppnar filväljaren. */}
      <label className="inline-block bg-slate-700 text-slate-200 px-4 py-2 rounded-lg cursor-pointer hover:bg-slate-600 mb-2">
        Välj bild
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png"
          onChange={e => {
            setFile(e.target.files[0] ?? null)
            setError('')
            setMessage('')
          }}
          className="hidden"
        />
      </label>

      {/* Visar vilken fil som är vald, så att du ser att valet har registrerats */}
      <p className="text-sm text-slate-300 mb-3">
        {file ? `Vald fil: ${file.name}` : 'Ingen fil vald'}
      </p>

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="bg-emerald-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-400 disabled:opacity-50"
      >
        {uploading ? 'Laddar upp...' : product.image_url ? 'Byt bild' : 'Ladda upp bild'}
      </button>

      {error && <p className="text-red-400 mt-2">{error}</p>}
      {message && <p className="text-emerald-400 mt-2">{message}</p>}
      {warning && <p className="text-amber-400 mt-2">{warning}</p>}
    </div>
  )
}

export default ProductImageUpload