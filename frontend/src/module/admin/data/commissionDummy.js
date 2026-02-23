// Dummy data for Delivery Boy Commission Rules

export const commissionDummy = [
  {
    sl: 1,
    name: "Short Distance (0-2 km)",
    minDistance: 0,
    maxDistance: 2,
    commissionPerKm: 15,
    basePayout: 20,
    status: true,
  },
  {
    sl: 2,
    name: "Medium Distance (2-5 km)",
    minDistance: 2,
    maxDistance: 5,
    commissionPerKm: 12,
    basePayout: 25,
    status: true,
  },
  {
    sl: 3,
    name: "Long Distance (5-10 km)",
    minDistance: 5,
    maxDistance: 10,
    commissionPerKm: 10,
    basePayout: 30,
    status: true,
  },
  {
    sl: 4,
    name: "Very Long Distance (10+ km)",
    minDistance: 10,
    maxDistance: null, // null means unlimited
    commissionPerKm: 8,
    basePayout: 35,
    status: true,
  },
]

