/**
 * How an order is presented on the customer's order-tracking screen.
 *
 * These live outside the screen so they can be tested. Each one carried a bug that
 * reached customers: the status mapping told people their food was on its way while it
 * was still on the restaurant counter, and the rider mapping dropped the phone number
 * that had been fetched with the order, so there was no way to call the person carrying
 * it. See orderPresentation.test.js.
 */

/**
 * Map the backend order status to the view this screen renders.
 *
 * 'ready' means the food is ready and NOT yet collected, so it must never map to the
 * picked-up view. Three copies of this mapping used to live inline in the screen and all
 * three got exactly that wrong.
 *
 * Anything unrecognised returns null so the caller leaves the current view alone rather
 * than guessing at a stage.
 */
export const viewForOrderStatus = (status) => {
  switch (status) {
    case 'cancelled': return 'cancelled'
    case 'delivered': return 'delivered'
    case 'out_for_delivery': return 'pickup'
    case 'ready': return 'ready'
    case 'preparing': return 'preparing'
    default: return null
  }
}

/**
 * Display form for an Indian mobile number. Never throws on junk - unrecognised input is
 * handed back as it came, because a customer seeing an odd number is better than a screen
 * that fails to render.
 */
export const formatPhoneForDisplay = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 10) return `+91 ${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2)}`
  return String(raw || '')
}

/**
 * The rider to show for an order, or null when the order has none.
 *
 * Deliberately no fallback to a previously-seen rider. An order can lose its rider - a
 * reassignment, or a reclaim - and showing the last one would put a stranger's phone
 * number in front of the customer with a call button beside it.
 */
export const riderFromOrder = (apiOrder) => {
  const rider = apiOrder?.deliveryPartnerId
  if (!rider) return null
  return {
    name: rider.name || 'Delivery Partner',
    phone: rider.phone || '',
    avatar: null,
  }
}
