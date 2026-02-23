// Dummy data for Restaurant Join Requests
// Food images from src/assets

import food1 from "@/assets/download.jpg"
import food2 from "@/assets/download (1).jpg"
import food3 from "@/assets/download (3).jpg"
import food4 from "@/assets/download (4).jpg"
import food5 from "@/assets/download (5).jpg"

export const restaurantJoinRequestsDummy = [
  {
    sl: 1,
    restaurantName: "TEST",
    restaurantImage: food1,
    ownerName: "Devid 123",
    ownerPhone: "0**********",
    zone: "All over the World",
    businessModel: "Subscription Base",
    status: "Pending",
  },
  {
    sl: 2,
    restaurantName: "Food Paradise",
    restaurantImage: food2,
    ownerName: "John Smith",
    ownerPhone: "+1**********",
    zone: "Zone 1",
    businessModel: "Commission Base",
    status: "Pending",
  },
  {
    sl: 3,
    restaurantName: "Pizza Corner",
    restaurantImage: food3,
    ownerName: "Maria Garcia",
    ownerPhone: "+1**********",
    zone: "All over the World",
    businessModel: "Subscription Base",
    status: "Pending",
  },
  {
    sl: 4,
    restaurantName: "Burger House",
    restaurantImage: food4,
    ownerName: "David Johnson",
    ownerPhone: "+1**********",
    zone: "Zone 2",
    businessModel: "Commission Base",
    status: "Pending",
  },
  {
    sl: 5,
    restaurantName: "Sushi Master",
    restaurantImage: food5,
    ownerName: "Sarah Williams",
    ownerPhone: "+1**********",
    zone: "All over the World",
    businessModel: "Subscription Base",
    status: "Pending",
  },
]

export const rejectedRestaurantRequestsDummy = [
  {
    sl: 1,
    restaurantName: "Rejected Restaurant",
    restaurantImage: food1,
    ownerName: "Test Owner",
    ownerPhone: "+1**********",
    zone: "Zone 1",
    businessModel: "Commission Base",
    status: "Rejected",
  },
]

