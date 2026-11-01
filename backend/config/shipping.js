// Shoppens egen prislista för frakt. Alla belopp är i ören
export const SHIPPING_OPTIONS = {
  pickup: { label: 'Ombud', priceOre: 5900 },       // 59 kr
  home: { label: 'Hemleverans', priceOre: 9900 }     // 99 kr
}

// Fri frakt när varorna kostar minst 500 kr
export const FREE_SHIPPING_FROM_ORE = 50000

export function shippingPriceOre(option, goodsOre) {
  if (!Object.hasOwn(SHIPPING_OPTIONS, option)) {
    throw new Error(`Okänt fraktalternativ: ${option}`)
  }
  return goodsOre >= FREE_SHIPPING_FROM_ORE ? 0 : SHIPPING_OPTIONS[option].priceOre
}

// Svaret som kassan visar, priset för varje alternativ i kronor
export function buildQuote(goodsOre) {
  return {
    goods_total: goodsOre / 100,
    free_shipping_from: FREE_SHIPPING_FROM_ORE / 100,
    options: Object.entries(SHIPPING_OPTIONS).map(([id, option]) => {
      const priceOre = shippingPriceOre(id, goodsOre)
      return { id, label: option.label, price: priceOre / 100, free: priceOre === 0 }
    })
  }
}