import { pool } from '../db/pool.js'
import { sendEmail } from '../integrations/emailAdapter.js'

// Gör om specialtecken till HTML-koder, så att t.ex. ett namn som "<script>" visas som text i stället för att köras eller förstöra mejlet
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const kr = amount => `${Math.round(Number(amount) * 100) / 100} kr`

// Bygger ämne, html och text för orderbekräftelsen
function buildEmail(order, items) {
  const shippingLabel = order.shipping_option === 'pickup' ? 'Ombud' : 'Hemleverans'
  const shippingPrice = Number(order.shipping_price)
  const servicePoint = order.service_point_name
    ? `${order.service_point_name}, ${order.service_point_address}`
    : null

  const subject = `Orderbekräftelse #${order.id}`

  // Textversion (för mejlprogram som inte visar html)
  const textLines = [
    `Hej ${order.customer_name}!`,
    '',
    `Tack för din beställning. Din order #${order.id} är betald.`,
    '',
    ...items.map(item => `- ${item.product_name} x ${item.quantity}: ${kr(item.price_at_purchase * item.quantity)}`),
    order.shipping_option
      ? `- Frakt (${shippingLabel}${servicePoint ? `: ${servicePoint}` : ''}): ${shippingPrice === 0 ? 'Gratis' : kr(shippingPrice)}`
      : null,
    '',
    `Totalt: ${kr(order.total)}`
  ].filter(line => line !== null)
  const text = textLines.join('\n')

  // Htmlversion. Allt som kommer från kunden eller databasen går genom escapeHtml
  const rows = items.map(item => `
        <tr>
          <td style="padding:6px 8px">${escapeHtml(item.product_name)} × ${item.quantity}</td>
          <td style="padding:6px 8px;text-align:right">${kr(item.price_at_purchase * item.quantity)}</td>
        </tr>`).join('')

  const shippingRow = order.shipping_option ? `
        <tr>
          <td style="padding:6px 8px">Frakt: ${shippingLabel}${servicePoint ? ` (${escapeHtml(servicePoint)})` : ''}</td>
          <td style="padding:6px 8px;text-align:right">${shippingPrice === 0 ? 'Gratis' : kr(shippingPrice)}</td>
        </tr>` : ''

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h1 style="font-size:22px">Tack för din beställning!</h1>
      <p>Hej ${escapeHtml(order.customer_name)}! Din order <strong>#${order.id}</strong> är betald.</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">${rows}${shippingRow}
        <tr>
          <td style="padding:10px 8px;border-top:1px solid #e2e8f0"><strong>Totalt</strong></td>
          <td style="padding:10px 8px;border-top:1px solid #e2e8f0;text-align:right"><strong>${kr(order.total)}</strong></td>
        </tr>
      </table>
      <p style="color:#64748b;font-size:13px">RetroStore</p>
    </div>`

  return { subject, html, text }
}

// Skickar orderbekräftelsen. Anropas efter att ordern markerats som betald
export async function sendOrderConfirmation(orderId) {
  const orderResult = await pool.query(
    `SELECT id, customer_name, customer_email, status, total,
            shipping_option, shipping_price, service_point_name, service_point_address
     FROM orders WHERE id = $1`,
    [orderId]
  )
  const order = orderResult.rows[0]

  // Bara betalda ordrar får en bekräftelse
  if (!order || order.status !== 'Betald') return { sent: false }

  const itemsResult = await pool.query(
    'SELECT product_name, price_at_purchase, quantity FROM order_items WHERE order_id = $1',
    [orderId]
  )

  const { subject, html, text } = buildEmail(order, itemsResult.rows)

  const result = await sendEmail({
    to: order.customer_email,
    subject,
    html,
    text,
    // Knuten till ordern, skickas samma webhook igen får kunden ändå bara ett mejl
    idempotencyKey: `order-confirmation/${order.id}`
  })
  return { sent: true, id: result.id }
}