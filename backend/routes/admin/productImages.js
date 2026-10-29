import { Router } from 'express'
import multer from 'multer'
import { replaceProductImage, ImageError, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from '../../services/productImageService.js'
import { StorageError } from '../../integrations/storageAdapter.js'

const router = Router()

// memoryStorage behåller filen i minnet, så att vi kan kontrollera den
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }
})

router.post('/products/:id/image', (req, res) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Ogiltigt produkt-id' })
  }

  upload.single('image')(req, res, async uploadError => {
    // Fel från själva uppladdningen, t.ex. en för stor fil
    if (uploadError) {
      if (uploadError instanceof multer.MulterError) {
        const message = uploadError.code === 'LIMIT_FILE_SIZE'
          ? `Bilden är för stor (högst ${MAX_IMAGE_MB} MB)`
          : 'Ogiltig uppladdning'
        return res.status(400).json({ error: message })
      }
      console.error(uploadError)
      return res.status(500).json({ error: 'Uppladdningen misslyckades' })
    }

    try {
      res.json(await replaceProductImage(productId, req.file))
    } catch (err) {
      // Egna fel har ett färdigt meddelande. Andra fel visar vi inga detaljer för.
      if (err instanceof ImageError || err instanceof StorageError) {
        return res.status(err.status).json({ error: err.message })
      }
      console.error(err)
      res.status(500).json({ error: 'Uppladdningen misslyckades' })
    }
  })
})

export default router