import { Router } from 'express'
import { reindexAll } from '../../services/searchIndexService.js'
import { SearchIndexError } from '../../integrations/algoliaAdapter.js'

const router = Router()

// POST /admin/search/reindex, skickar alla produkter till sökindexet
router.post('/search/reindex', async (req, res) => {
  try {
    res.json(await reindexAll())
  } catch (err) {
    console.error(err)
    if (err instanceof SearchIndexError) {
      return res.status(err.status).json({ error: err.message })
    }
    res.status(500).json({ error: 'Synkningen misslyckades' })
  }
})

export default router