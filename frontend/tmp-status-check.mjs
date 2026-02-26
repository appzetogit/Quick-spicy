import axios from 'axios'
import { getRestaurantAvailabilityStatus } from './src/lib/utils/restaurantAvailability.js'
const slug='restaurant-7890'
const base='http://localhost:5000/api'
const dining=await axios.get(`${base}/dining/restaurants/${slug}`).then(r=>r.data.data).catch(()=>null)
const rest = dining || (await axios.get(`${base}/restaurant/${slug}`)).data.data
const actual = rest?.restaurant || rest
const transformed={
  isActive: actual?.isActive !== false,
  isAcceptingOrders: actual?.isAcceptingOrders !== false,
  openDays: Array.isArray(actual?.openDays) ? actual.openDays : [],
  deliveryTimings: actual?.deliveryTimings || null,
}
if (actual?._id){
  const outlet=(await axios.get(`${base}/restaurant/${actual._id}/outlet-timings`)).data?.data?.outletTimings
  transformed.outletTimings = outlet || null
}
const status=getRestaurantAvailabilityStatus(transformed, new Date())
console.log(JSON.stringify({now:new Date().toString(), transformed, status}, null, 2))
