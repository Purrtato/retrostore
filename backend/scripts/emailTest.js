import 'dotenv/config'
import { sendEmail } from '../integrations/emailAdapter.js'

// Kör: node scripts/emailTest.js din-adress@exempel.se
const to = process.argv[2]
if (!to) {
  console.log('Skriv mottagarens adress: node scripts/emailTest.js adress@exempel.se')
  process.exit(1)
}

try {
  const result = await sendEmail({
    to,
    subject: 'Testmejl från RetroStore',
    html: '<p>Det här är ett <strong>testmejl</strong>.</p>',
    text: 'Det här är ett testmejl.',
    idempotencyKey: `test/${Date.now()}` // ny nyckel varje gång, så att inget blockeras som dubblett
  })
  console.log('Skickat, id:', result.id)
} catch (err) {
  console.log('Misslyckades:', err.message)
}