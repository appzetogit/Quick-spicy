/**
 * Restaurant Management Utility Functions
 * Centralized management for restaurant details across the restaurant module
 */

// Default restaurant data
const DEFAULT_RESTAURANT_DATA = {
  restaurantName: {
    english: "Hungry Puppets",
    bengali: "",
    arabic: "",
    spanish: ""
  },
  phoneNumber: "+101747410000",
  address: "House: 00, Road: 00, Test City",
  logo: null,
  cover: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&h=400&fit=crop",
  metaTitle: "Hungry Puppets Restaurant: Where Fla",
  metaDescription: "Satisfy your cravings and indulge in a culinary adventure at Hungry Puppets Restaurant. Our menu is a symphony of taste, offering a delightful fusion of flavors that excite both palate and",
  metaImage: null,
  rating: 4.7,
  totalRatings: 3
}

const RESTAURANT_STORAGE_KEY = 'restaurant_data'

/**
 * Get restaurant data from localStorage
 * @returns {Object} - Restaurant data object
 */
export const getRestaurantData = () => {
  try {
    const saved = localStorage.getItem(RESTAURANT_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
    // Initialize with default data
    setRestaurantData(DEFAULT_RESTAURANT_DATA)
    return DEFAULT_RESTAURANT_DATA
  } catch (error) {
    console.error('Error reading restaurant data from localStorage:', error)
    return DEFAULT_RESTAURANT_DATA
  }
}

/**
 * Save restaurant data to localStorage
 * @param {Object} restaurantData - Restaurant data object
 */
export const setRestaurantData = (restaurantData) => {
  try {
    localStorage.setItem(RESTAURANT_STORAGE_KEY, JSON.stringify(restaurantData))
    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('restaurantDataUpdated'))
    // Trigger storage event for cross-tab updates
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    console.error('Error saving restaurant data to localStorage:', error)
  }
}

/**
 * Update restaurant data (merge with existing)
 * @param {Object} updates - Partial restaurant data to update
 * @returns {Object} - Updated restaurant data
 */
export const updateRestaurantData = (updates) => {
  const currentData = getRestaurantData()
  const updatedData = {
    ...currentData,
    ...updates,
    // Merge restaurantName object if it exists
    restaurantName: updates.restaurantName 
      ? { ...currentData.restaurantName, ...updates.restaurantName }
      : currentData.restaurantName
  }
  setRestaurantData(updatedData)
  return updatedData
}

