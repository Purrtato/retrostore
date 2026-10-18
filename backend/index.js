// Måste ligga först så att .env är inläst innan resten av koden körs
import 'dotenv/config'
import app from './app.js'

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servern kör på port ${PORT}`))