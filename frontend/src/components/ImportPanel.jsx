import { useState } from 'react'
import { api } from '../api'

// Två knappar (CSV/XML) som startar importen och visar en rapport
function ImportPanel({ onDone }) {
  const [loading, setLoading] = useState(null) // vilket format som körs just nu
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  async function runImport(format) {
    setLoading(format)
    setError('')
    setReport(null)
    try {
      const data = await api(`/admin/import/${format}`, { method: 'POST' })
      setReport(data)
      onDone?.() // t.ex. hämta produktlistan på nytt
    } catch (err) {
      setError(err.message) // meddelande från servern
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
      <h2 className="text-lg font-semibold text-white mb-3">Importera från leverantör</h2>

      <div className="flex gap-3">
        {['csv', 'xml'].map(format => (
          <button
            key={format}
            onClick={() => runImport(format)}
            disabled={loading !== null}
            className="bg-emerald-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading === format ? 'Importerar...' : `Importera ${format.toUpperCase()}`}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 mt-3">{error}</p>}

      {report && (
        <div className="mt-3 text-sm text-slate-300">
          <p>
            Nya: {report.created} · Uppdaterade: {report.updated} · Överhoppade: {report.skipped.length}
          </p>
          <ul className="list-disc ml-5 mt-2">
            {report.skipped.map(s => (
              <li key={s.article_number}>{s.article_number}: {s.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ImportPanel