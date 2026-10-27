import Stripe from 'stripe'
import { z } from 'zod'

export class PaymentError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

let stripeClient

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new PaymentError('Betalningen är inte konfigurerad på servern', 500)
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 })
  return stripeClient
}


//Priserna kommer alltid från databasen
export async function createCheckoutSession({ orderId, customerEmail, lines }) {
  const clientUrl = process.env.CLIENT_URL
  if (!clientUrl) throw new PaymentError('Betalningen är inte konfigurerad på servern', 500)

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: String(orderId), // orderns id följer med betalningen
      customer_email: customerEmail,
      line_items: lines.map(line => ({
        quantity: line.quantity,
        price_data: {
          currency: 'sek',
          unit_amount: line.unitAmountOre,
          product_data: { name: line.name }
        }
      })),
      // {CHECKOUT_SESSION_ID} ersätts av Stripe med sessionens id när kunden skickas tillbaka
      success_url: `${clientUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/cart`,
      // Sessionen löper ut efter 30 minuter
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60
    })
    return { id: session.id, url: session.url }
  } catch (err) {
    // Detaljer loggas bara på servern
    console.error('Stripe-fel vid skapande av session:', err.type, err.message)
    if (err instanceof PaymentError) throw err
    throw new PaymentError('Betaltjänsten svarar inte just nu, försök igen om en stund', 502)
  }
}

// Stripe skickar orderns id som text
const orderIdSchema = z.string().regex(/^\d+$/)

// Verifierar signaturen och översätter Stripes händelse till vårt eget format:
// PaymentError (400) om signaturen inte är giltig.
export function parseWebhook(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new PaymentError('Webhooken är inte konfigurerad på servern', 500)

  let event
  try {
    // Kontrollerar att anropet verkligen kommer från Stripe
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret)
  } catch {
    throw new PaymentError('Ogiltig signatur', 400)
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.expired') {
    return { kind: 'ignored' }
  }

  const session = event.data.object
  const parsedId = orderIdSchema.safeParse(session.client_reference_id)
  if (!parsedId.success) {
    console.warn('Webhook utan giltigt order-id, hoppar över', event.id)
    return { kind: 'ignored' }
  }
  const orderId = Number(parsedId.data)

  if (event.type === 'checkout.session.expired') {
    return { kind: 'expired', orderId }
  }
  // completed: räknas som betald först när Stripe säger att pengarna är dragna
  if (session.payment_status === 'paid') {
    return { kind: 'paid', orderId }
  }
  return { kind: 'ignored' }
}