import { z } from 'zod'

const TIMEOUT_MS = 5000 // varje anrop avbryts efter 5 sekunder
const BATCH_SIZE = 100  // max antal produkter per skrivanrop

export class SearchIndexError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

// mode 'write' använder skrivnyckeln, mode 'read' använder sök-nyckeln.
// Skrivnyckeln används alltså aldrig för sökningar.
async function algoliaRequest({ mode, method, path, body }) {
  const appId = process.env.ALGOLIA_APP_ID
  const indexName = process.env.ALGOLIA_INDEX_NAME
  const apiKey = mode === 'write' ? process.env.ALGOLIA_WRITE_KEY : process.env.ALGOLIA_SEARCH_KEY

  if (!appId || !apiKey || !indexName) {
    throw new SearchIndexError('Sökindexet är inte konfigurerat på servern', 500)
  }

  // Först huvudadressen (en för skrivning, en för läsning), sedan tre reservadresser.
  // Om en adress inte svarar testar vi nästa i stället för att ge upp direkt.
  const hosts = [
    mode === 'write' ? `${appId}.algolia.net` : `${appId}-dsn.algolia.net`,
    `${appId}-1.algolianet.com`,
    `${appId}-2.algolianet.com`,
    `${appId}-3.algolianet.com`
  ]

  let lastError = null

  for (const host of hosts) {
    const url = `https://${host}/1/indexes/${encodeURIComponent(indexName)}${path}`

    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          'X-Algolia-Application-Id': appId,
          'X-Algolia-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS) // timeout enligt de gemensamma kraven
      })
    } catch (err) {
      // Nätverksfel eller timeout: logga orsaken (aldrig några nycklar) och testa nästa adress
      lastError = err
      console.warn(`Algolia: kunde inte nå ${host} (${err.cause?.code || err.name}), testar nästa adress`)
      continue
    }

    // Fel hos Algolia: testa nästa adress
    if (res.status >= 500) {
      lastError = new Error(`Algolia svarade ${res.status}`)
      console.warn(`Algolia: ${host} svarade ${res.status}, testar nästa adress`)
      continue
    }

    // Fel som beror på oss (nycklar, gränser, felaktig förfrågan) går inte att lösa med en annan adress
    if (res.status === 429) throw new SearchIndexError('För många anrop till sökindexet', 429)
    if (res.status === 401 || res.status === 403) {
      throw new SearchIndexError('Sökindexet nekade åtkomst (kontrollera nycklarna)', 502)
    }
    if (!res.ok) {
      // Loggas bara på servern: Algolias egen förklaring, t.ex. "Index products does not exist"
      console.error('Algolia svarade', res.status, await res.text().catch(() => ''))
      throw new SearchIndexError(`Sökindexet svarade med fel (${res.status})`, 502)
    }

    try {
      return await res.json()
    } catch {
      throw new SearchIndexError('Ogiltigt svar från sökindexet', 502)
    }
  }

  // Ingen adress svarade
  if (lastError?.name === 'TimeoutError') {
    throw new SearchIndexError('Sökindexet svarade inte i tid', 504)
  }
  throw new SearchIndexError('Kunde inte nå sökindexet', 502)
}

// objectID = artikelnumret, så att samma produkt uppdateras i stället för att dupliceras.
// Produkter som skapats för hand på adminsidan saknar artikelnummer och får id-baserat objectID.
export function objectIdFor(product) {
  return product.article_number || `id-${product.id}`
}

// Det vi lägger i sökindexet. Image_url och liknande skickas med för att kunna visa träffarna.
function toRecord(p) {
  return {
    objectID: objectIdFor(p),
    id: Number(p.id), // bigint kommer som text från pg
    article_number: p.article_number ?? null,
    name: p.name,
    description: p.description ?? '',
    price: Number(p.price), // numeric kommer som text från pg
    category: p.category ?? '',
    stock: Number(p.stock ?? 0),
    image_url: p.image_url ?? '',
    ean: p.ean ?? null
  }
}

function chunked(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}

// Skapar eller uppdaterar produkter (updateObject = upsert på objectID)
export async function saveProducts(products) {
  for (const chunk of chunked(products, BATCH_SIZE)) {
    await algoliaRequest({
      mode: 'write', method: 'POST', path: '/batch',
      body: { requests: chunk.map(p => ({ action: 'updateObject', body: toRecord(p) })) }
    })
  }
}

// Tar bort produkter ur indexet. Att ta bort något som inte finns ger inget fel.
export async function removeProducts(products) {
  for (const chunk of chunked(products, BATCH_SIZE)) {
    await algoliaRequest({
      mode: 'write', method: 'POST', path: '/batch',
      body: { requests: chunk.map(p => ({ action: 'deleteObject', body: { objectID: objectIdFor(p) } })) }
    })
  }
}

// Säger till Algolia vilka fält som ska sökas i
export async function configureIndex() {
  await algoliaRequest({
    mode: 'write', method: 'PUT', path: '/settings',
    body: { searchableAttributes: ['name', 'category', 'article_number', 'ean', 'description'] }
  })
}

// Vi validerar Algolias svar innan vi använder det
const hitSchema = z.object({
  id: z.number(),
  article_number: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  price: z.number(),
  category: z.string().nullable().optional(),
  stock: z.number(),
  image_url: z.string().nullable().optional()
})

const responseSchema = z.object({
  hits: z.array(z.unknown()),
  nbHits: z.number(),
  nbPages: z.number(),
  page: z.number()
})

// Översätter en träff till shoppens format (samma fält som /products)
function toShopProduct(hit) {
  return {
    id: hit.id,
    article_number: hit.article_number ?? null,
    name: hit.name,
    description: hit.description ?? '',
    price: hit.price,
    category: hit.category ?? '',
    stock: hit.stock,
    image_url: hit.image_url ?? ''
  }
}

// page börjar på 1 hos oss. Svaret är i shoppens format, aldrig Algolias rådata.
export async function searchProducts({ query, page, pageSize }) {
  const data = await algoliaRequest({
    mode: 'read', method: 'POST', path: '/query',
    body: {
      query,
      page: page - 1, // Algolia börjar på sida 0
      hitsPerPage: pageSize,
      attributesToRetrieve: ['id', 'article_number', 'name', 'description', 'price', 'category', 'stock', 'image_url'],
      attributesToHighlight: [] // vi behöver inte markeringarna
    }
  })

  const parsed = responseSchema.safeParse(data)
  if (!parsed.success) throw new SearchIndexError('Oväntat svar från sökindexet', 502)

  // Trasiga träffar hoppas över i stället för att krascha hela sökningen
  const items = parsed.data.hits.flatMap(hit => {
    const result = hitSchema.safeParse(hit)
    return result.success ? [toShopProduct(result.data)] : []
  })

  return {
    items,
    total: parsed.data.nbHits,
    page: parsed.data.page + 1,
    pageSize,
    totalPages: parsed.data.nbPages
  }
}