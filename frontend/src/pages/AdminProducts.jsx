import { useState, useEffect } from 'react'
import { api } from '../api' // ersätter API_URL, api() lägger till adressen och skickar med cookien

function AdminProducts() {
  // Listan med alla produkter, hämtade från backend
  const [products, setProducts] = useState([])

  // Håller värdena i formuläret just nu
  const [formData, setFormData] = useState({
    name: '', description: '', price: '', category: '', stock: '', image_url: ''
  })

  // Vi skapar en ny produkt (null) eller redigerar en befintlig (id)
  const [editingId, setEditingId] = useState(null)

  // Felmeddelande att visa om ett anrop misslyckas (t.ex. 401 om du blivit utloggad)
  const [error, setError] = useState('')

  // Körs en gång när komponenten laddas första gången
  // Hämtar produktlistan direkt när admin-sidan öppnas
  useEffect(() => {
    fetchProducts()
  }, [])

  // Hämtar alla produkter från backend och sparar dem i "products"-state
  function fetchProducts() {
    api('/products')
      .then(data => setProducts(data))
      .catch(err => setError(err.message))
  }

  // Körs varje gång man skriver i ett input-fält
  // e.target.name = vilket fält som ändrades (t.ex. "price")
  // e.target.value = det nya värdet man skrev in
  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    // ...formData kopierar alla befintliga fält
  }

  // Nollställer formuläret och avslutar ev. redigeringsläge
  function resetForm() {
    setFormData({ name: '', description: '', price: '', category: '', stock: '', image_url: '' })
    setEditingId(null)
  }

  // Körs när man trycker "Skapa produkt" / "Spara ändringar"
  async function handleSubmit(e) {
    e.preventDefault() // stoppar sidan från att ladda om
    setError('')       // rensa ett gammalt felmeddelande

    // Väljer sökväg och metod beroende på om vi skapar (POST) eller redigerar (PUT)
    const path = editingId ? `/products/${editingId}` : '/products'
    const method = editingId ? 'PUT' : 'POST'

    try {
      // body skickas som ett vanligt objekt, api() gör själv JSON.stringify
      await api(path, { method, body: formData })
      resetForm()      // Töm formuläret
      fetchProducts()  // Hämta uppdaterad lista, så ändringen syns direkt
    } catch (err) {
      // Utan det här skulle ett 401 se ut som att "ingenting hände"
      setError(err.message)
    }
  }

  // Körs när man klickar "Redigera" på en produkt
  // Fyller formuläret med produktens nuvarande värden
  function handleEdit(product) {
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      stock: product.stock,
      image_url: product.image_url
    })
    setEditingId(product.id) // "Kom ihåg" vilken produkt vi redigerar
  }

  // Körs när man klickar "Ta bort"
  async function handleDelete(id) {
    if (!confirm('Ta bort produkten?')) return // Avbryt om man klickar "Avbryt" i rutan
    setError('')

    try {
      await api(`/products/${id}`, { method: 'DELETE' })
      fetchProducts() // Hämta uppdaterad lista (produkten är nu is_active=false)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Admin - Produkter</h1>

        {/* Visar felmeddelandet om något gick fel */}
        {error && <p className="text-red-400 mb-4">{error}</p>}

        <div className="grid md:grid-cols-2 gap-8 min-w-0">

          {/* Vänster kolumn, formuläret */}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? 'Redigera produkt' : 'Ny produkt'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Namn"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
                required
              />
              <input
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Beskrivning"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
              />
              <input
                name="price"
                type="number"
                value={formData.price}
                onChange={handleChange}
                placeholder="Pris"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
                required
              />
              <input
                name="category"
                value={formData.category}
                onChange={handleChange}
                placeholder="Kategori"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
              />
              <input
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleChange}
                placeholder="Lagerantal"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
              />
              <input
                name="image_url"
                value={formData.image_url}
                onChange={handleChange}
                placeholder="Bild-URL"
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 p-3 rounded-lg w-full focus:border-emerald-400 focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-emerald-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  {editingId ? 'Spara ändringar' : 'Skapa produkt'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-slate-700 text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Avbryt
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Höger kolumn, produktlistan */}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white mb-4">Alla produkter</h2>
            <ul className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {products.map(product => (
                <li
                  key={product.id}
                  className="bg-slate-800 border border-slate-700 p-3 rounded-lg flex justify-between items-center gap-2 min-w-0"
                >
                  <span className="text-white truncate min-w-0">
                    {product.name} - {product.price} kr
                  </span>
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => handleEdit(product)}
                      className="text-emerald-400 hover:text-emerald-300 text-sm"
                    >
                      Redigera
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Ta bort
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>
  )
}

export default AdminProducts