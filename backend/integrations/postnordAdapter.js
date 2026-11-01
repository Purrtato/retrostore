import { z } from 'zod'

const TIMEOUT_MS = 5000             // Varje anrop avbryts efter 5 sekunder
const CACHE_TTL_MS = 5 * 60 * 1000

export class PostNordError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

export const PATHS = {
  servicePoints: '/rest/businesslocation/v5/servicepoints/nearest/byaddress',
  transitTime: '/rest/transport/v2/transittime/addresstoaddress'
}
const MAX_SERVICE_POINTS = 5
// PostNords tjänstekoder tex. 19 = MyPack Collect (ombud), 17 = MyPack Home (hemleverans)
export const SERVICE_CODES = { pickup: '19', home: '17' }

function getConfig() {
  const baseUrl = process.env.POSTNORD_BASE_URL?.replace(/\/+$/, '')
  const apiKey = process.env.POSTNORD_API_KEY
  if (!baseUrl || !apiKey) {
    throw new PostNordError('Frakttjänsten är inte konfigurerad på servern', 500)
  }
  return { baseUrl, apiKey }
}

// Bygger adressen. PostNord tar nyckeln som query-parameter
export function buildUrl(path, params) {
  const { baseUrl, apiKey } = getConfig()
  const url = new URL(baseUrl + path)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('apikey', apiKey)
  return url
}

// Anrop med timeout och felhantering
async function getJson(path, params) {
  const url = buildUrl(path, params)

  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    // Loggar orsaken men aldrig adressen
    console.error('PostNord-anrop misslyckades:', err.name, err.cause?.code || err.message)
    if (err.name === 'TimeoutError') throw new PostNordError('PostNord svarade inte i tid', 504)
    throw new PostNordError('Kunde inte nå PostNord', 502)
  }

  if (res.status === 401 || res.status === 403) {
    throw new PostNordError('PostNord nekade åtkomst (kontrollera nyckeln)', 502)
  }
  if (res.status === 429) throw new PostNordError('För många anrop till PostNord', 429)
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 500)
    // PostNords egen förklaring loggas bara på servern
    console.error('PostNord svarade', res.status, body)
    if (res.status === 400) {
      // "Postalcode not found" betyder att postnumret inte finns hos PostNord
      const message = /postalcode not found/i.test(body) ? 'Postnumret hittades inte' : 'PostNord godtog inte förfrågan'
      throw new PostNordError(message, 400)
    }
    throw new PostNordError(`PostNord svarade med fel (${res.status})`, 502)
  }

  try {
    return await res.json()
  } catch {
    throw new PostNordError('Ogiltigt svar från PostNord', 502)
  }
}

const cache = new Map()

function fromCache(key) {
  const hit = cache.get(key)
  return hit && hit.expires > Date.now() ? hit.value : null
}

const text = z.union([z.string(), z.number()]).nullish().transform(v => (v == null ? '' : String(v)))

// Fälten är kontrollerade mot PostNords riktiga svar från sandlådan
const servicePointSchema = z.object({
  servicePointId: z.union([z.string(), z.number()]).transform(String),
  name: z.string().min(1),
  visitingAddress: z.object({
    streetName: text, streetNumber: text, postalCode: text, city: text
  }).nullish(),
  routeDistance: z.number().nullish()
})

const servicePointsResponseSchema = z.object({
  servicePointInformationResponse: z.object({
    servicePoints: z.array(z.unknown()).nullish()
  })
})

// Returnerar de närmaste ombuden i shoppens format
export async function getServicePoints(postalCode) {
  const cacheKey = `sp:${postalCode}`
  const cached = fromCache(cacheKey)
  if (cached) return cached

  const data = await getJson(PATHS.servicePoints, {
    countryCode: 'SE',
    postalCode,
    numberOfServicePoints: String(MAX_SERVICE_POINTS),
    returnType: 'json'
  })

  // Extern data valideras innan den används
  const parsed = servicePointsResponseSchema.safeParse(data)
  if (!parsed.success) {
    console.error('Oväntat svar om ombud från PostNord:', parsed.error.issues.slice(0, 3))
    throw new PostNordError('Oväntat svar från PostNord', 502)
  }

  // Trasiga poster hoppas över i stället för att krascha hela listan
  const items = (parsed.data.servicePointInformationResponse.servicePoints ?? []).flatMap(raw => {
    const result = servicePointSchema.safeParse(raw)
    if (!result.success) return []
    const sp = result.data
    const address = sp.visitingAddress
    return [{
      id: sp.servicePointId,
      name: sp.name,
      street: [address?.streetName, address?.streetNumber].filter(Boolean).join(' '),
      postalCode: address?.postalCode ?? '',
      city: address?.city ?? '',
      distanceMeters: sp.routeDistance ?? null
    }]
  })

  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value: items })
  return items
}

// Servern kör i UTC, så räknas om till svensk tid
export function localStartTime() {
  let value = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date()).replace(' ', 'T')

  // Om formatet av någon anledning blir ett annat använder vi UTC-tid som reserv
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) value = new Date().toISOString().slice(0, 16)
  return value
}

// Svaret är en lista med en rad per tjänst
const transitEntrySchema = z.object({
  service: z.object({
    basicServiceCode: z.string(),
    additionalServices: z.unknown().optional() // dokumentationen visar både lista och objekt, vi behöver bara veta om den finns
  }),
  estimatedTimeOfArrival: z.object({
    timeOfArrival: z.string().nullish(),
    dayRangeOfArrival: z.object({
      daysMinimum: z.number().nullish(),
      daysMaximum: z.number().nullish()
    }).nullish()
  }).nullish(),
  isBookable: z.boolean().nullish(),
  errorMessage: z.string().nullish()
})

function hasAdditionalServices(extra) {
  return Array.isArray(extra) ? extra.length > 0 : extra != null
}

// Gör om en tjänsterad till {date} eller {daysMin, daysMax}, eller null om ingen leveranstid kunde beräknas
function toEstimate(entry) {
  if (entry.errorMessage || entry.isBookable === false) return null
  const eta = entry.estimatedTimeOfArrival
  if (eta?.timeOfArrival && /^\d{4}-\d{2}-\d{2}/.test(eta.timeOfArrival)) {
    return { date: eta.timeOfArrival.slice(0, 10) }
  }
  const range = eta?.dayRangeOfArrival
  if (range && Number.isInteger(range.daysMinimum) && Number.isInteger(range.daysMaximum)) {
    return { daysMin: range.daysMinimum, daysMax: range.daysMaximum }
  }
  return null
}

// Returnerar beräknad leverans från shoppens postnummer till kundens
export async function getDeliveryEstimate(toPostalCode) {
  const fromPostalCode = process.env.SHOP_POSTAL_CODE
  if (!fromPostalCode) throw new PostNordError('Shoppens postnummer saknas på servern', 500)

  const cacheKey = `eta:${toPostalCode}:${new Date().toISOString().slice(0, 13)}` // en ny nyckel varje timme
  const cached = fromCache(cacheKey)
  if (cached) return cached

  const data = await getJson(PATHS.transitTime, {
    startTime: localStartTime(),
    serviceCodes: Object.values(SERVICE_CODES).join(','), // båda tjänsterna i ett anrop
    originPostalCode: fromPostalCode,
    originCountryCode: 'SE',
    destinationPostalCode: toPostalCode,
    destinationCountryCode: 'SE'
  })

  // Extern data valideras innan vi använder den
  const list = z.array(z.unknown()).safeParse(data)
  if (!list.success) {
    console.error('Oväntat svar om leveranstid från PostNord')
    throw new PostNordError('Oväntat svar från PostNord', 502)
  }

  const result = { pickup: null, home: null }
  for (const raw of list.data) {
    const entry = transitEntrySchema.safeParse(raw)
    if (!entry.success) continue
    if (hasAdditionalServices(entry.data.service.additionalServices)) continue

    for (const [option, code] of Object.entries(SERVICE_CODES)) {
      if (entry.data.service.basicServiceCode === code && !result[option]) {
        result[option] = toEstimate(entry.data)
      }
    }
  }

  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value: result })
  return result
}