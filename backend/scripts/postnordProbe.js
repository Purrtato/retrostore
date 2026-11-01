import 'dotenv/config'
import { PATHS, buildUrl, localStartTime } from '../integrations/postnordAdapter.js'

console.log('Startar testet mot PostNord...')

const postalCode = process.argv[2] ?? '11153'

async function probe(name, path, params) {
  const url = buildUrl(path, params)
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const body = await res.text()
  // Skriver aldrig ut adressen, för den innehåller API-nyckeln
  console.log(`\n=== ${name} ===`)
  console.log('Status:', res.status)
  console.log(body.slice(0, 3000))
}

await probe('Ombud', PATHS.servicePoints, {
  countryCode: 'SE', postalCode, numberOfServicePoints: '3', returnType: 'json'
})

await probe('Leveranstid', PATHS.transitTime, {
  startTime: localStartTime(),
  serviceCodes: '17,19',
  originPostalCode: process.env.SHOP_POSTAL_CODE,
  originCountryCode: 'SE',
  destinationPostalCode: postalCode,
  destinationCountryCode: 'SE'
})