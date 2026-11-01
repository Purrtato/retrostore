import { useCart } from '../context/CartContext'

// Visar lagersaldot och en knapp som stängs av när varan är slut eller när kunden redan har lagt så många som finns
function AddToCart({ product }) {
  const { addToCart, quantityInCart } = useCart()

  const stock = Number(product.stock)
  const inCart = quantityInCart(product.id)
  const soldOut = !(stock > 0)
  const maxReached = !soldOut && inCart >= stock

  // Text om saldot. Vid lågt saldo visas hur många som är kvar
  let stockText = `${stock} i lager`
  if (soldOut) stockText = 'Slut i lager'
  else if (stock <= 5) stockText = `Endast ${stock} kvar`

  let buttonText = 'Lägg i varukorgen'
  if (soldOut) buttonText = 'Slut i lager'
  else if (maxReached) buttonText = 'Max antal i varukorgen'

  return (
    <div>
      <p className={soldOut ? 'text-sm text-red-400 mb-2' : 'text-sm text-slate-400 mb-2'}>{stockText}</p>
      <button
        type="button"
        onClick={() => addToCart(product)}
        disabled={soldOut || maxReached}
        className="bg-emerald-500 text-slate-900 font-semibold px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {buttonText}
      </button>
    </div>
  )
}

export default AddToCart