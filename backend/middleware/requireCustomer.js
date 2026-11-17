// Släpper bara igenom inloggade kunder. Kontrollen sker alltid på servern.
export function requireCustomer(req, res, next) {
  if (req.session?.customerId) return next()
  res.status(401).json({ error: 'Du måste vara inloggad' })
}