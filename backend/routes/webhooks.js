import express, { Router } from 'express'
import { parseWebhook, PaymentError } from '../integrations/stripeAdapter.js'
import { markOrderPaid, markOrderCancelled } from '../services/orderPaymentService.js'
import { sendOrderConfirmation } from '../services/orderEmailService.js'

const router = Router()

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event
  try {
    event = parseWebhook(req.body, req.headers['stripe-signature'])
  } catch (err) {
    // Ogiltig signatur, 400 och ingen order ändras
    const status = err instanceof PaymentError ? err.status : 400
    return res.status(status).json({ error: 'Ogiltig webhook' })
  }

  // Uppdatera ordern. Misslyckas det svarar den 500, och Stripe försöker igen senare
  try {
    if (event.kind === 'paid') await markOrderPaid(event.orderId)
    if (event.kind === 'expired') await markOrderCancelled(event.orderId)
  } catch (err) {
    console.error('Webhook-fel:', err)
    return res.status(500).json({ error: 'Kunde inte behandla händelsen' })
  }

  // Skicka orderbekräftelsen, efter att ordern är markerad som betald
  if (event.kind === 'paid') {
    try {
      const result = await sendOrderConfirmation(event.orderId)
      if (result.sent) console.log(`Orderbekräftelse skickad för order ${event.orderId}`)
    } catch (err) {
      console.error(`Kunde inte skicka orderbekräftelse för order ${event.orderId}:`, err.message)
    }
  }

  res.json({ received: true }) // 200 = Stripe slutar skicka just den här händelsen
})

export default router