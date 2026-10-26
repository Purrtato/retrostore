import { useState } from 'react'
import { api } from '../api'

// Knappar för import (CSV/XML) och synkning av sökindex, med en rapport
function ImportPanel({ onDone }) {
  const [loading, setLoading] = useState(null) // vilken åtgärd som körs just nu
  const [report, setReport] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function runImport(format) {
    setLoading(format)
    setError('')
    setReport(null)
    setMessage('')
    try {
      const data = await api(`/admin/import/${format}`, { method: 'POST' })
      setReport(data)
      onDone?.() // hämta produktlistan på nytt
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  async function runReindex() {
    setLoading('reindex')
    setError('')
    setReport(null)
    setMessage('')
    try {
      const data = await api('/admin/search/reindex', { method: 'POST' })
      setMessage(`Sökindexet är uppdaterat: ${data.indexed} produkter indexerade.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  const buttonClass =
    'bg-emerald-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-400 disabled:opacity-50'

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
      <h2 className="text-lg font-semibold text-white mb-3">Leverantör och sökindex</h2>

      <div className="flex flex-wrap gap-3">
        {['csv', 'xml'].map(format => (
          <button
            key={format}
            onClick={() => runImport(format)}
            disabled={loading !== null}
            className={buttonClass}
          >
            {loading === format ? 'Importerar...' : `Importera ${format.toUpperCase()}`}
          </button>
        ))}
        <button onClick={runReindex} disabled={loading !== null} className={buttonClass}>
          {loading === 'reindex' ? 'Synkar...' : 'Synka sökindex'}
        </button>
      </div>

      {error && <p className="text-red-400 mt-3">{error}</p>}
      {message && <p className="text-emerald-400 mt-3">{message}</p>}

      {report && (
        <div className="mt-3 text-sm text-slate-300">
          <p>
            Nya: {report.created} · Uppdaterade: {report.updated} · Överhoppade: {report.skipped.length}
          </p>
          {/* Importen är sparad, men sökindexet kanske inte hann uppdateras */}
          {report.searchIndex && !report.searchIndex.synced && (
            <p className="text-amber-400 mt-2">{report.searchIndex.warning}</p>
          )}
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