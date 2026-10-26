import searchRouter from './routes/search.js'
import adminSearchRouter from './routes/admin/search.js'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { pool } from './db/pool.js'
import authRouter from './routes/auth.js'
import productsRouter from './routes/products.js'
import ordersRouter from './routes/orders.js'
import { requireAdmin } from './middleware/requireAdmin.js'
import adminImportRouter from './routes/admin/import.js'

const app = express()
const isProd = process.env.NODE_ENV === 'production'

// Render ligger bakom en proxy. Utan detta tror Express att anropet är http
// och skickar aldrig ut "secure"-cookien.
app.set('trust proxy', 1)

// credentials: true krävs för att webbläsaren ska få skicka cookies till API:et,
// och då måste origin vara en exakt adress (inte *)
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())

// Sessioner lagras i Postgres (tabellen "session" skapas automatiskt)
const PgSession = connectPgSimple(session)
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,             // spara inte om inget ändrats
  saveUninitialized: false,  // skapa ingen session för anonyma besökare
  cookie: {
    httpOnly: true,                    // JavaScript i webbläsaren kommer inte åt cookien
    secure: isProd,                    // bara över https i produktion
    sameSite: isProd ? 'none' : 'lax', // 'none' behövs när Vercel och Render ligger på olika domäner
    maxAge: 1000 * 60 * 60 * 8         // 8 timmar
  }
}))

app.get('/', (req, res) => {
  res.send('E-handel API, servern kör')
})

app.use('/auth', authRouter)
app.use('/products', productsRouter)
app.use('/orders', ordersRouter)
app.use('/api/search', searchRouter)
app.use('/api/search', searchRouter)
app.use('/admin', requireAdmin, adminImportRouter)
app.use('/admin', requireAdmin, adminSearchRouter)

export default app