import express, { Router } from 'express'
import { parseWebhook, PaymentError } from '../integrations/stripeAdapter.js'
import { markOrderPaid, markOrderCancelled } from '../services/orderPaymentService.js'

const router = Router()

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event
  try {
    event = parseWebhook(req.body, req.headers['stripe-signature'])
  } catch (err) {
    // Ogiltig signatur: 400 och ingen order ändras
    const status = err instanceof PaymentError ? err.status : 400
    return res.status(status).json({ error: 'Ogiltig webhook' })
  }

  try {
    if (event.kind === 'paid') await markOrderPaid(event.orderId)
    if (event.kind === 'expired') await markOrderCancelled(event.orderId)
    res.json({ received: true }) // 200 = Stripe slutar skicka just den här händelsen
  } catch (err) {
    console.error('Webhook-fel:', err)
    res.status(500).json({ error: 'Kunde inte behandla händelsen' }) // Stripe försöker igen senare
  }
})

export default router