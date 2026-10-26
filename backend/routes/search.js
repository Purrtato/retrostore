import { Router } from 'express'
import { z } from 'zod'
import { searchProducts, SearchIndexError } from '../integrations/algoliaAdapter.js'

const router = Router()

const MAX_PAGE_SIZE = 50 // maxtak på antal produkter per sida

// Alla parametrar kommer som text i url:en, så z.coerce gör om dem till tal innan de kontrolleras
const querySchema = z.object({
  q: z.string().trim().max(100, 'får vara högst 100 tecken').default(''),
  page: z.coerce.number().int().min(1, 'måste vara minst 1').default(1),
  pageSize: z.coerce.number().int().min(1, 'måste vara minst 1')
    .max(MAX_PAGE_SIZE, `får vara högst ${MAX_PAGE_SIZE}`).default(12)
})

const TYPE_HINTS = { q: 'måste vara text', page: 'måste vara ett heltal', pageSize: 'måste vara ett heltal' }

function describeIssues(issues) {
  return issues
    .map(issue => {
      const param = issue.path[0]
      if (issue.code === 'invalid_type') return `${param} ${TYPE_HINTS[param] ?? 'är ogiltig'}`
      return `${param} ${issue.message}`
    })
    .join('; ')
}

router.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    // Ogiltiga värden ger 400 med ett begripligt fel
    return res.status(400).json({ error: `Ogiltiga sökparametrar: ${describeIssues(parsed.error.issues)}` })
  }

  const { q, page, pageSize } = parsed.data
  try {
    res.json(await searchProducts({ query: q, page, pageSize }))
  } catch (err) {
    console.error(err)
    const status = err instanceof SearchIndexError ? err.status : 500
    res.status(status).json({ error: 'Sökningen är tillfälligt otillgänglig, försök igen om en stund' })
  }
})

export default router