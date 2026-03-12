import { api } from "@/lib/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"

// Helper function to check if a step is complete
const isStepComplete = (stepData, stepNumber) => {
  if (!stepData) return false

  if (stepNumber === 1) {
    return (
      stepData.restaurantName &&
      stepData.ownerName &&
      stepData.ownerEmail &&
      stepData.ownerPhone &&
      stepData.primaryContactNumber &&
      stepData.location?.area &&
      stepData.location?.city
    )
  }

  if (stepNumber === 2) {
    return (
      Array.isArray(stepData.cuisines) &&
      stepData.cuisines.length > 0 &&
      stepData.deliveryTimings?.openingTime &&
      stepData.deliveryTimings?.closingTime &&
      Array.isArray(stepData.openDays) &&
      stepData.openDays.length > 0 &&
      // Check for menu images (must have at least one)
      Array.isArray(stepData.menuImageUrls) &&
      stepData.menuImageUrls.length > 0 &&
      // Check for profile image
      stepData.profileImageUrl &&
      (stepData.profileImageUrl.url || typeof stepData.profileImageUrl === 'string')
    )
  }

  if (stepNumber === 3) {
    const hasPanImage = stepData.pan?.image && 
      (stepData.pan.image.url || typeof stepData.pan.image === 'string')
    const hasFssaiImage = stepData.fssai?.image && 
      (stepData.fssai.image.url || typeof stepData.fssai.image === 'string')
    // GST image is required only if GST is registered
    const hasGstImage = !stepData.gst?.isRegistered || 
      (stepData.gst?.image && (stepData.gst.image.url || typeof stepData.gst.image === 'string'))
    
    return (
      stepData.pan?.panNumber &&
      stepData.pan?.nameOnPan &&
      hasPanImage &&
      stepData.fssai?.registrationNumber &&
      hasFssaiImage &&
      hasGstImage &&
      stepData.bank?.accountNumber &&
      stepData.bank?.ifscCode &&
      stepData.bank?.accountHolderName &&
      stepData.bank?.accountType
    )
  }

  if (stepNumber === 4) {
    return (
      stepData.estimatedDeliveryTime &&
      stepData.featuredDish &&
      stepData.featuredPrice &&
      stepData.offer
    )
  }

  return false
}

const buildOnboardingLikeDataFromRestaurant = (restaurant) => {
  const onboarding = restaurant?.onboarding || {}

  return {
    completedSteps: onboarding.completedSteps,
    step1: onboarding.step1 || {
      restaurantName: restaurant?.name,
      ownerName: restaurant?.ownerName,
      ownerEmail: restaurant?.ownerEmail || restaurant?.email,
      ownerPhone: restaurant?.ownerPhone || restaurant?.phone,
      primaryContactNumber: restaurant?.primaryContactNumber,
      location: restaurant?.location,
    },
    step2: onboarding.step2 || {
      cuisines: restaurant?.cuisines,
      deliveryTimings: restaurant?.deliveryTimings,
      openDays: restaurant?.openDays,
      menuImageUrls: restaurant?.menuImages,
      profileImageUrl: restaurant?.profileImage,
    },
    step3: onboarding.step3 || null,
    step4: onboarding.step4 || {
      estimatedDeliveryTime: restaurant?.estimatedDeliveryTime,
      featuredDish: restaurant?.featuredDish,
      featuredPrice: restaurant?.featuredPrice,
      offer: restaurant?.offer,
    },
  }
}

export const isRestaurantOnboardingComplete = (restaurant) => {
  if (!restaurant) return false

  const onboardingLikeData = buildOnboardingLikeDataFromRestaurant(restaurant)
  if (onboardingLikeData.completedSteps === 4) {
    return true
  }

  const step1Complete = isStepComplete(onboardingLikeData.step1, 1)
  const step2Complete = isStepComplete(onboardingLikeData.step2, 2)
  const step3Complete = isStepComplete(onboardingLikeData.step3, 3)
  const step4Complete = isStepComplete(onboardingLikeData.step4, 4)

  if (step1Complete && step2Complete && step3Complete && step4Complete) {
    return true
  }

  // Some older or migrated restaurant accounts have complete live profile data
  // without a reliable onboarding.completedSteps value.
  const hasOperationalProfile =
    Boolean(String(restaurant?.name || "").trim()) &&
    Boolean(String(restaurant?.restaurantId || "").trim()) &&
    Boolean(String(restaurant?.slug || "").trim()) &&
    step1Complete &&
    step2Complete &&
    step4Complete &&
    (restaurant?.approvedAt || restaurant?.rejectedAt || restaurant?.rejectionReason || restaurant?.isActive === false)

  if (hasOperationalProfile) {
    return true
  }

  return false
}

// Determine which step to show based on completeness
export const determineStepToShow = (data) => {
  if (!data) return 1

  // If completedSteps is 4, onboarding is complete (admin-created restaurants)
  if (data.completedSteps === 4) {
    return null
  }

  // Check step 1
  if (!isStepComplete(data.step1, 1)) {
    return 1
  }

  // Check step 2
  if (!isStepComplete(data.step2, 2)) {
    return 2
  }

  // Check step 3
  if (!isStepComplete(data.step3, 3)) {
    return 3
  }

  // Check step 4
  if (!isStepComplete(data.step4, 4)) {
    return 4
  }

  // All steps complete
  return null
}

export const getIncompleteOnboardingStep = (restaurant) => {
  if (!restaurant) return 1

  const onboardingLikeData = buildOnboardingLikeDataFromRestaurant(restaurant)
  return determineStepToShow(onboardingLikeData)
}

// Check onboarding status from API and return the step to navigate to
export const checkOnboardingStatus = async () => {
  try {
    const restaurantResponse = await api.get("/restaurant/auth/me")
    const restaurant =
      restaurantResponse?.data?.data?.restaurant ||
      restaurantResponse?.data?.restaurant ||
      null

    if (restaurant && isRestaurantOnboardingComplete(restaurant)) {
      return null
    }

    const res = await api.get("/restaurant/onboarding")
    const data = res?.data?.data?.onboarding
    if (data) {
      const stepToShow = determineStepToShow(data)
      return stepToShow
    }
    // No onboarding data, start from step 1
    return 1
  } catch (err) {
    // If API call fails, check localStorage
    try {
      const localData = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (localData) {
        const parsed = JSON.parse(localData)
        return parsed.currentStep || 1
      }
    } catch (localErr) {
      debugError("Failed to check localStorage:", localErr)
    }
    // Default to step 1 if everything fails
    return 1
  }
}

