import { Router } from 'express'
import { importProducts } from '../../services/importService.js'
import { SupplierError } from '../../integrations/supplierAdapter.js'

const router = Router()

router.post('/import/:format', async (req, res) => {
  const { format } = req.params
  if (format !== 'csv' && format !== 'xml') {
    return res.status(400).json({ error: 'Formatet måste vara csv eller xml' })
  }

  try {
    const report = await importProducts(format)
    res.json(report)
  } catch (err) {
    console.error(err)
    if (err instanceof SupplierError) {
      return res.status(err.status).json({ error: err.message })
    }
    res.status(500).json({ error: 'Importen misslyckades' })
  }
})

export default router