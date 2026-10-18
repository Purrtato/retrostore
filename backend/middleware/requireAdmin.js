// Middleware som släpper igenom anropet bara om sessionen är markerad som admin
export function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) {
    return next() // inloggad, gå vidare till nästa steg
  }
  // 401 = "du är inte inloggad"
  res.status(401).json({ error: 'Du måste vara inloggad som admin' })
}