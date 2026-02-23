/**
 * Food Management Utility Functions
 * Centralized management for restaurant foods across the restaurant module
 */

import { usdToInr } from './currency'

// Default foods data (matching existing hardcoded data)
const DEFAULT_FOODS = [
  {
    id: 1,
    name: "Medu Vada",
    nameArabic: "ميدو فادا",
    image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=200&h=200&fit=crop",
    category: "Varieties",
    rating: 0.0,
    reviews: 0,
    price: 95.00,
    stock: 100,
    discount: null,
    originalPrice: null,
    foodType: "Non-Veg",
    availabilityTimeStart: "12:01 AM",
    availabilityTimeEnd: "11:57 PM",
    description: "Fada list consists of crispy, thin, soft and delicious lentil pancakes from South Indian cuisine.",
    discountType: "Percent",
    discountAmount: 0.0,
    isAvailable: true,
    isRecommended: false,
    variations: [
      { id: 1, name: "Capacity - 1 Person", price: 0.00, stock: 10 },
      { id: 2, name: "Capacity - 2 Person", price: 70.00, stock: 30 },
      { id: 3, name: "Capacity - 4 Person", price: 130.00, stock: 30 }
    ],
    tags: ["breakfast"],
    nutrition: ["Calories", "Protein"],
    allergies: ["Dairy"]
  },
  {
    id: 2,
    name: "grilled lemon herb Mediterranea...",
    nameArabic: "",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&h=200&fit=crop",
    category: "Varieties",
    rating: 0.0,
    reviews: 0,
    price: 320.00,
    stock: "Unlimited",
    discount: null,
    originalPrice: null,
    foodType: "Non-Veg",
    availabilityTimeStart: "12:01 AM",
    availabilityTimeEnd: "11:57 PM",
    description: "",
    discountType: "Percent",
    discountAmount: 0.0,
    isAvailable: true,
    isRecommended: false,
    variations: [],
    tags: [],
    nutrition: [],
    allergies: []
  },
  {
    id: 3,
    name: "Meat Pizza",
    nameArabic: "",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=200&fit=crop",
    category: "Varieties",
    rating: 4.7,
    reviews: 3,
    price: 350.00,
    stock: 50,
    discount: 30.0,
    originalPrice: 500.00,
    foodType: "Non-Veg",
    availabilityTimeStart: "12:01 AM",
    availabilityTimeEnd: "11:57 PM",
    description: "Delicious meat pizza with fresh ingredients",
    discountType: "Percent",
    discountAmount: 30.0,
    isAvailable: true,
    isRecommended: true,
    variations: [],
    tags: ["pizza", "meat"],
    nutrition: ["Calories", "Protein", "Carbs"],
    allergies: []
  },
  {
    id: 4,
    name: "Cheese Pizza",
    nameArabic: "",
    image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=300&fit=crop",
    category: "Italian",
    rating: 0.0,
    reviews: 0,
    price: usdToInr(232.50),
    originalPrice: usdToInr(250.00),
    discount: "7.0% OFF",
    stock: "Unlimited",
    foodType: "Non-Veg",
    availabilityTimeStart: "12:01 AM",
    availabilityTimeEnd: "11:57 PM",
    description: "Classic cheese pizza",
    discountType: "Percent",
    discountAmount: 7.0,
    isAvailable: true,
    isRecommended: false,
    variations: [],
    tags: ["pizza", "cheese"],
    nutrition: [],
    allergies: ["Dairy"]
  },
  {
    id: 5,
    name: "Thai Fried Rice",
    nameArabic: "",
    image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop",
    category: "Varieties",
    rating: 0.0,
    reviews: 0,
    price: usdToInr(160.00),
    originalPrice: null,
    discount: null,
    stock: "Unlimited",
    foodType: "Non-Veg",
    availabilityTimeStart: "12:01 AM",
    availabilityTimeEnd: "11:57 PM",
    description: "Authentic Thai fried rice",
    discountType: "Percent",
    discountAmount: 0.0,
    isAvailable: true,
    isRecommended: false,
    variations: [],
    tags: ["rice", "thai"],
    nutrition: [],
    allergies: []
  }
]

const FOODS_STORAGE_KEY = 'restaurant_foods'
const FOOD_ID_COUNTER_KEY = 'restaurant_food_id_counter'

/**
 * Get all foods from localStorage
 * @returns {Array} - Array of food objects
 */
export const getAllFoods = () => {
  try {
    const saved = localStorage.getItem(FOODS_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
    // Initialize with default foods
    setAllFoods(DEFAULT_FOODS)
    return DEFAULT_FOODS
  } catch (error) {
    console.error('Error reading foods from localStorage:', error)
    return DEFAULT_FOODS
  }
}

/**
 * Save all foods to localStorage
 * @param {Array} foods - Array of food objects
 */
const setAllFoods = (foods) => {
  try {
    localStorage.setItem(FOODS_STORAGE_KEY, JSON.stringify(foods))
  } catch (error) {
    console.error('Error saving foods to localStorage:', error)
  }
}

/**
 * Get food by ID
 * @param {string|number} id - The food ID
 * @returns {Object|null} - Food object or null if not found
 */
export const getFoodById = (id) => {
  if (!id) return null
  
  try {
    const foods = getAllFoods()
    const food = foods.find(f => f.id === parseInt(id) || f.id === id)
    return food || null
  } catch (error) {
    console.error('Error getting food by ID:', error)
    return null
  }
}

/**
 * Get next food ID
 * @returns {number} - Next available food ID
 */
const getNextFoodId = () => {
  try {
    const counter = localStorage.getItem(FOOD_ID_COUNTER_KEY)
    if (counter) {
      const nextId = parseInt(counter) + 1
      localStorage.setItem(FOOD_ID_COUNTER_KEY, nextId.toString())
      return nextId
    }
    // Initialize counter based on existing foods
    const foods = getAllFoods()
    const maxId = foods.length > 0 ? Math.max(...foods.map(f => f.id)) : 0
    const nextId = maxId + 1
    localStorage.setItem(FOOD_ID_COUNTER_KEY, nextId.toString())
    return nextId
  } catch (error) {
    console.error('Error getting next food ID:', error)
    // Fallback: use timestamp
    return Date.now()
  }
}

/**
 * Save or update a food
 * @param {Object} foodData - Food object to save
 * @returns {Object} - Saved food object with ID
 */
export const saveFood = (foodData) => {
  if (!foodData) return null
  
  try {
    const foods = getAllFoods()
    const isNewFood = !foodData.id || !foods.find(f => f.id === foodData.id)
    
    let savedFood
    if (isNewFood) {
      // New food - assign ID
      const newId = getNextFoodId()
      savedFood = {
        ...foodData,
        id: newId,
        // Set defaults for missing fields
        rating: foodData.rating ?? 0.0,
        reviews: foodData.reviews ?? 0,
        variations: foodData.variations || [],
        tags: foodData.tags || [],
        nutrition: foodData.nutrition || [],
        allergies: foodData.allergies || [],
        isAvailable: foodData.isAvailable !== undefined ? foodData.isAvailable : true,
        isRecommended: foodData.isRecommended || false
      }
      foods.push(savedFood)
      // Dispatch event for new food
      window.dispatchEvent(new CustomEvent('foodAdded', { detail: { food: savedFood } }))
    } else {
      // Update existing food
      const index = foods.findIndex(f => f.id === foodData.id)
      if (index !== -1) {
        savedFood = {
          ...foods[index],
          ...foodData,
          id: foodData.id // Preserve ID
        }
        foods[index] = savedFood
        // Dispatch event for updated food
        window.dispatchEvent(new CustomEvent('foodUpdated', { detail: { food: savedFood } }))
      } else {
        // Food not found, treat as new
        const newId = getNextFoodId()
        savedFood = { ...foodData, id: newId }
        foods.push(savedFood)
        window.dispatchEvent(new CustomEvent('foodAdded', { detail: { food: savedFood } }))
      }
    }
    
    setAllFoods(foods)
    // Dispatch general food change event
    window.dispatchEvent(new CustomEvent('foodsChanged'))
    // Trigger storage event for cross-tab updates
    window.dispatchEvent(new Event('storage'))
    
    return savedFood
  } catch (error) {
    console.error('Error saving food:', error)
    return null
  }
}

/**
 * Delete a food by ID
 * @param {string|number} id - The food ID to delete
 * @returns {boolean} - True if deleted, false otherwise
 */
export const deleteFood = (id) => {
  if (!id) return false
  
  try {
    const foods = getAllFoods()
    const index = foods.findIndex(f => f.id === parseInt(id) || f.id === id)
    
    if (index !== -1) {
      const deletedFood = foods[index]
      foods.splice(index, 1)
      setAllFoods(foods)
      // Dispatch event for deleted food
      window.dispatchEvent(new CustomEvent('foodDeleted', { detail: { food: deletedFood } }))
      window.dispatchEvent(new CustomEvent('foodsChanged'))
      window.dispatchEvent(new Event('storage'))
      return true
    }
    
    return false
  } catch (error) {
    console.error('Error deleting food:', error)
    return false
  }
}

/**
 * Update food stock
 * @param {string|number} id - The food ID
 * @param {number|string} stock - New stock value
 * @returns {boolean} - True if updated, false otherwise
 */
export const updateFoodStock = (id, stock) => {
  if (!id) return false
  
  try {
    const food = getFoodById(id)
    if (food) {
      return saveFood({ ...food, stock }) !== null
    }
    return false
  } catch (error) {
    console.error('Error updating food stock:', error)
    return false
  }
}

