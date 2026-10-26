import { parse as parseCsv } from 'csv-parse/sync'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

const TIMEOUT_MS = 5000          // chaos-servern kan ta 8 sekunder, så de långsamma anropen avbryts
const MAX_ATTEMPTS = 3           // totalt 3 försök vid tillfälliga fel (503, timeout, nätverksfel)
const API_KEY_HEADER = 'X-Api-Key'

// Eget felobjekt med ett begripligt meddelande och en HTTP-status som routen kan skicka vidare
export class SupplierError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function decodeBuffer(buffer, contentType = '') {
  const match = /charset=([^;]+)/i.exec(contentType)
  const charset = match ? match[1].trim().toLowerCase() : 'utf-8'
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer) // okänd teckenkodning: UTF-8 i stället för krasch
  }
}

async function fetchExport(format) {
  const baseUrl = process.env.SUPPLIER_API_URL 
  const apiKey = process.env.SUPPLIER_API_KEY
  const branch = process.env.SUPPLIER_BRANCH

  if (!baseUrl || !apiKey) {
    throw new SupplierError('Leverantörens inställningar saknas på servern', 500)
  }

  const query = branch ? `?bransch=${encodeURIComponent(branch)}` : ''
  const url = `${baseUrl}/export/products.${format}${query}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS
    let res
    let buffer

    try {
      res = await fetch(url, {
        headers: { [API_KEY_HEADER]: apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS) // timeout enligt de gemensamma kraven
      })
      if (res.ok) buffer = Buffer.from(await res.arrayBuffer())
    } catch (err) {
      // Timeout eller nätverksfel: försök igen, ge upp efter sista försöket
      if (!isLastAttempt) {
        await sleep(500)
        continue
      }
      if (err.name === 'TimeoutError') {
        throw new SupplierError('Leverantören svarade inte i tid, försök igen om en stund', 504)
      }
      throw new SupplierError('Kunde inte nå leverantören', 502)
    }

    if (res.ok) return decodeBuffer(buffer, res.headers.get('content-type') || '')

    // Rate limit (10 anrop per 10 sekunder): försök inte igen automatiskt, berätta hur länge man ska vänta
    if (res.status === 429) {
      const wait = res.headers.get('Retry-After') || '10'
      throw new SupplierError(`För många anrop till leverantören, försök igen om ${wait} sekunder`, 429)
    }

    // Fel hos leverantören (t.ex. 503): försök igen
    if (res.status >= 500) {
      if (!isLastAttempt) {
        await sleep(500)
        continue
      }
      throw new SupplierError('Leverantören är tillfälligt nere, försök igen om en stund', 502)
    }

    // Övriga fel går inte att lösa med nya försök
    if (res.status === 401 || res.status === 403) {
      throw new SupplierError('Leverantören nekade åtkomst (kontrollera API-nyckeln)', 502)
    }
    throw new SupplierError(`Leverantören svarade med fel (${res.status})`, 502)
  }
}

function parseCsvText(text) {
  try {
    return parseCsv(text, {
      columns: true,
      delimiter: ';',
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true
    })
  } catch {
    throw new SupplierError('Kunde inte tolka CSV-filen från leverantören')
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: name => name === 'produkt' || name === 'variant'
})

// Plattar ut en XML-produkt så att den får samma form som en CSV-rad
function flattenXmlProduct(p) {
  return {
    artNr: p['@_artNr'],
    ean: p.ean,
    benamning: p.benamning,
    kategori: p.kategori,
    pris: typeof p.pris === 'object' ? p.pris['#text'] : p.pris,
    lagersaldo: p.lagersaldo,
    varianter: p.varianter?.variant ?? []
  }
}

function parseXmlText(text) {
  let parsed
  try {
    parsed = xmlParser.parse(text)
  } catch {
    throw new SupplierError('Kunde inte tolka XML-filen från leverantören')
  }
  const products = parsed?.katalog?.produkt
  if (!products) throw new SupplierError('XML-filen från leverantören innehöll inga produkter')
  return products.map(flattenXmlProduct)
}

function toNumber(value) {
  if (value == null) return null
  const cleaned = String(value).replace(/[\s\u00a0]/g, '').replace(',', '.')
  if (cleaned === '') return null
  return Number(cleaned)
}

function toVariantList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split('|')
  return list.map(v => String(v).trim()).filter(Boolean)
}

function toCandidate(raw) {
  const text = v => (v == null ? '' : String(v).trim())
  return {
    article_number: text(raw.artNr),
    name: text(raw.benamning),
    category: text(raw.kategori),
    price: toNumber(raw.pris),
    stock: toNumber(raw.lagersaldo) ?? 0,
    ean: text(raw.ean) || null,
    variants: toVariantList(raw.varianter)
  }
}

const productSchema = z.object({
  article_number: z.string().min(1, 'artikelnummer saknas'),
  name: z.string().min(1, 'namn saknas'),
  category: z.string(),
  price: z.number().positive('priset måste vara större än 0'),
  stock: z.number().int().min(0, 'lagersaldot kan inte vara negativt'),
  ean: z.string().regex(/^\d{8,14}$/, 'EAN ska vara 8–14 siffror').nullable(),
  variants: z.array(z.string())
})

const FIELD_LABELS = {
  article_number: 'artikelnummer', name: 'namn', category: 'kategori',
  price: 'pris', stock: 'lagersaldo', ean: 'EAN', variants: 'varianter'
}

// Gör Zods fel till en kort orsak på svenska som admin kan läsa i rapporten
function describeIssues(issues) {
  return issues
    .map(issue => {
      const label = FIELD_LABELS[issue.path[0]] ?? issue.path[0]
      if (issue.code === 'invalid_type') return `${label} saknas eller är ogiltigt`
      return issue.message
    })
    .join('; ')
}

// Returnerar { products, skipped } i shoppens format, aldrig leverantörens rådata
export async function fetchSupplierProducts(format) {
  const text = await fetchExport(format)
  const records = format === 'csv' ? parseCsvText(text) : parseXmlText(text)

  if (records.length === 0) {
    throw new SupplierError('Filen från leverantören var tom')
  }

  const products = []
  const skipped = []
  const seen = new Set()

  records.forEach((record, index) => {
    const candidate = toCandidate(record)
    const label = candidate.article_number || `rad ${index + 1}`
    const result = productSchema.safeParse(candidate)

    if (!result.success) {
      // Trasig produkt: hoppa över och spara orsaken
      skipped.push({ article_number: label, reason: describeIssues(result.error.issues) })
      return
    }
    if (seen.has(candidate.article_number)) {
      skipped.push({ article_number: label, reason: 'dubblett i filen' })
      return
    }
    seen.add(candidate.article_number)
    products.push(result.data)
  })

  return { products, skipped }
}