const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

const normalizeDay = (value) => {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  const match = DAY_NAMES.find((day) => day.toLowerCase() === trimmed)
  if (match) return match

  const abbreviatedMatch = DAY_NAMES.find((day) =>
    day.toLowerCase().startsWith(trimmed.slice(0, 3))
  )
  return abbreviatedMatch || null
}

const parseTimeToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") return null
  const raw = timeValue.trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/)
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1])
    const minute = Number(meridiemMatch[2])
    const period = meridiemMatch[3]

    if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null

    if (period === "pm" && hour < 12) hour += 12
    if (period === "am" && hour === 12) hour = 0
    if (hour < 0 || hour > 23) return null
    return hour * 60 + minute
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!twentyFourHourMatch) return null

  const hour = Number(twentyFourHourMatch[1])
  const minute = Number(twentyFourHourMatch[2])
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour * 60 + minute
}

const getTodayTiming = (restaurant, dayName) => {
  const outletTimingsArray = restaurant?.outletTimings?.timings
  if (Array.isArray(outletTimingsArray)) {
    const exact = outletTimingsArray.find((entry) => normalizeDay(entry?.day) === dayName)
    if (exact) return exact
  }

  const outletTimingsObject = restaurant?.outletTimings
  if (outletTimingsObject && typeof outletTimingsObject === "object" && !Array.isArray(outletTimingsObject)) {
    const direct = outletTimingsObject[dayName]
    if (direct && typeof direct === "object") return direct
  }

  return null
}

const isWithinTimeWindow = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return true
  if (openingMinutes === closingMinutes) return true

  if (closingMinutes > openingMinutes) {
    return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes
  }

  return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes
}

export const getRestaurantAvailabilityStatus = (restaurant, now = new Date()) => {
  if (!restaurant) {
    return {
      isOpen: false,
      isActive: false,
      isAcceptingOrders: false,
      isWithinTimings: false,
      reason: "missing-restaurant",
    }
  }

  const isActive = restaurant.isActive !== false
  const isAcceptingOrders = restaurant.isAcceptingOrders !== false

  if (!isActive) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "inactive",
    }
  }

  if (!isAcceptingOrders) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "manual-offline",
    }
  }

  const dayName = DAY_NAMES[now.getDay()]
  const todayTiming = getTodayTiming(restaurant, dayName)

  // Legacy openDays can get stale; enforce only when no explicit outlet timing exists for today.
  const openDays = Array.isArray(restaurant.openDays) ? restaurant.openDays : []
  if (!todayTiming && openDays.length > 0) {
    const normalizedOpenDays = new Set(openDays.map((day) => normalizeDay(day)).filter(Boolean))
    if (normalizedOpenDays.size > 0 && !normalizedOpenDays.has(dayName)) {
      return {
        isOpen: false,
        isActive,
        isAcceptingOrders,
        isWithinTimings: false,
        reason: "closed-day",
      }
    }
  }

  if (todayTiming?.isOpen === false) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "day-closed",
    }
  }

  const openingTime = todayTiming?.openingTime || restaurant?.deliveryTimings?.openingTime || null
  const closingTime = todayTiming?.closingTime || restaurant?.deliveryTimings?.closingTime || null

  const openingMinutes = parseTimeToMinutes(openingTime)
  const closingMinutes = parseTimeToMinutes(closingTime)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const hasExplicitWindow = Boolean(openingTime || closingTime)
  const isWithinTimings = hasExplicitWindow
    ? (openingMinutes !== null && closingMinutes !== null
      ? isWithinTimeWindow(nowMinutes, openingMinutes, closingMinutes)
      : false)
    : true

  return {
    isOpen: isWithinTimings,
    isActive,
    isAcceptingOrders,
    isWithinTimings,
    openingTime,
    closingTime,
    reason: isWithinTimings ? "open" : (hasExplicitWindow ? "outside-hours" : "no-timings"),
  }
}
