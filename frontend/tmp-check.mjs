import { getRestaurantAvailabilityStatus } from './src/lib/utils/restaurantAvailability.js'
const restaurant={
 isActive:true,
 isAcceptingOrders:true,
 openDays:['Tue','Wed','Thu','Fri'],
 deliveryTimings:{openingTime:'11:10',closingTime:'13:00'},
 outletTimings:{timings:[
  {day:'Monday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'},
  {day:'Tuesday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'},
  {day:'Wednesday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'},
  {day:'Thursday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'},
  {day:'Friday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'},
  {day:'Saturday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'},
  {day:'Sunday',isOpen:true,openingTime:'09:00 AM',closingTime:'10:00 PM'}
 ]}
}
const now = new Date('2026-02-26T19:13:00')
console.log(getRestaurantAvailabilityStatus(restaurant, now))
