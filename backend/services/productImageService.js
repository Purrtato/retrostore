import { randomUUID } from 'crypto'
import { pool } from '../db/pool.js'
import { uploadImage, deleteImage } from '../integrations/storageAdapter.js'
import { syncProducts } from './searchIndexService.js'

export const MAX_IMAGE_MB = 2
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024

// Fel med en HTTP-status och ett meddelande som är säkert att visa för admin
export class ImageError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buffer.length >= 8 && png.every((byte, i) => buffer[i] === byte)) {
    return { mime: 'image/png', ext: 'png' }
  }
  return null
}

const PATH_PATTERN = /^products\/\d+\/[0-9a-f-]{36}\.(jpg|png)$/

export async function replaceProductImage(productId, file) {
  if (!file) throw new ImageError('Ingen bild skickades med', 400)
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError(`Bilden är för stor (högst ${MAX_IMAGE_MB} MB)`, 400)
  }

  const type = detectImageType(file.buffer)
  if (!type) throw new ImageError('Filen måste vara en JPEG- eller PNG-bild', 400)

  const existing = await pool.query('SELECT id, image_path FROM products WHERE id = $1', [productId])
  if (!existing.rows[0]) throw new ImageError('Produkten hittades inte', 404)
  const oldPath = existing.rows[0].image_path

  // Ny, unik sökväg: aldrig adminens filnamn, och ett slumpmässigt id gör att inget kan skrivas över
  const newPath = `products/${productId}/${randomUUID()}.${type.ext}`

  const uploaded = await uploadImage({ path: newPath, buffer: file.buffer, contentType: type.mime })

  let product
  try {
    const result = await pool.query(
      'UPDATE products SET image_path = $1, image_url = $2 WHERE id = $3 RETURNING *',
      [newPath, uploaded.url, productId]
    )
    product = result.rows[0]
  } catch (err) {
    await deleteImage(newPath).catch(() => {}) // städa bort den nyss uppladdade filen
    throw err
  }
  if (!product) {
    await deleteImage(newPath).catch(() => {})
    throw new ImageError('Produkten hittades inte', 404)
  }

  if (oldPath && oldPath !== newPath && PATH_PATTERN.test(oldPath)) {
    await deleteImage(oldPath).catch(err => console.warn('Kunde inte ta bort gammal bild:', oldPath, err.message))
  }

  const searchIndex = await syncProducts([product])
  return { product, searchIndexWarning: searchIndex.warning }
}