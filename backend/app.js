import express from 'express'
import cors from 'cors'
import productsRouter from './routes/products.js'
import ordersRouter from './routes/orders.js'

// Appen skapas här men startas i index.js
const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('E-handel API, servern kör')
})

// Allt som börjar på /products respektive /orders skickas till rätt router
app.use('/products', productsRouter)
app.use('/orders', ordersRouter)

export default app