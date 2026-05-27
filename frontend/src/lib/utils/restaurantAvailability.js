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

const isDayAvailable = (restaurant, dayName, timingForDay) => {
  const openDays = Array.isArray(restaurant?.openDays) ? restaurant.openDays : []

  if (timingForDay?.isOpen === false) {
    return false
  }

  if (!timingForDay && openDays.length > 0) {
    const normalizedOpenDays = new Set(openDays.map((day) => normalizeDay(day)).filter(Boolean))
    if (normalizedOpenDays.size > 0 && !normalizedOpenDays.has(dayName)) {
      return false
    }
  }

  return true
}

const isWithinTimeWindow = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return true
  if (openingMinutes === closingMinutes) return true

  if (closingMinutes > openingMinutes) {
    return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes
  }

  return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes
}

const getMinutesUntilClosing = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return null
  if (!isWithinTimeWindow(nowMinutes, openingMinutes, closingMinutes)) return null

  if (closingMinutes > openingMinutes) {
    return closingMinutes - nowMinutes
  }

  if (nowMinutes <= closingMinutes) {
    return closingMinutes - nowMinutes
  }

  return (24 * 60 - nowMinutes) + closingMinutes
}

const formatTimeLabel = (timeValue) => {
  const totalMinutes = parseTimeToMinutes(timeValue)
  if (totalMinutes === null) return timeValue || null

  const hours24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 || 12

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`
}

const formatClosingCountdown = (minutesUntilClose, closingTime) => {
  if (minutesUntilClose === null || minutesUntilClose === undefined) return null

  if (minutesUntilClose <= 0) {
    const closingLabel = formatTimeLabel(closingTime)
    return closingLabel ? `Closes at ${closingLabel}` : null
  }

  if (minutesUntilClose < 60) {
    return `Closing in ${minutesUntilClose} mins`
  }

  const hours = Math.floor(minutesUntilClose / 60)
  const minutes = minutesUntilClose % 60

  if (minutes === 0) {
    return `Closing in ${hours} ${hours === 1 ? "hour" : "hours"}`
  }

  return `Closing in ${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${minutes === 1 ? "min" : "mins"}`
}

const formatOpeningCountdown = (minutesUntilOpen, openingTime) => {
  if (minutesUntilOpen === null || minutesUntilOpen === undefined) return null

  if (minutesUntilOpen <= 0) {
    return "Opens now"
  }

  if (minutesUntilOpen < 60) {
    return `Opens in ${minutesUntilOpen} mins`
  }

  const hours = Math.floor(minutesUntilOpen / 60)
  const minutes = minutesUntilOpen % 60

  if (hours >= 24) {
    const openingLabel = formatTimeLabel(openingTime)
    return openingLabel ? `Opens at ${openingLabel}` : "Opens later"
  }

  if (minutes === 0) {
    return `Opens in ${hours} ${hours === 1 ? "hour" : "hours"}`
  }

  return `Opens in ${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${minutes === 1 ? "min" : "mins"}`
}

const getMinutesUntilNextOpening = (restaurant, now, fallbackOpeningTime) => {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  for (let offset = 0; offset < 7; offset += 1) {
    const candidateDate = new Date(now)
    candidateDate.setDate(now.getDate() + offset)
    const dayName = DAY_NAMES[candidateDate.getDay()]
    const timingForDay = getTodayTiming(restaurant, dayName)

    if (!isDayAvailable(restaurant, dayName, timingForDay)) {
      continue
    }

    const openingTime = timingForDay?.openingTime || restaurant?.deliveryTimings?.openingTime || fallbackOpeningTime || null
    const closingTime = timingForDay?.closingTime || restaurant?.deliveryTimings?.closingTime || null
    const openingMinutes = parseTimeToMinutes(openingTime)
    const closingMinutes = parseTimeToMinutes(closingTime)

    if (openingMinutes === null) {
      continue
    }

    if (offset === 0) {
      if (closingMinutes !== null && closingMinutes > openingMinutes && nowMinutes < openingMinutes) {
        return { minutesUntilOpen: openingMinutes - nowMinutes, nextOpeningTime: openingTime }
      }

      if (closingMinutes !== null && closingMinutes < openingMinutes && nowMinutes > closingMinutes && nowMinutes < openingMinutes) {
        return { minutesUntilOpen: openingMinutes - nowMinutes, nextOpeningTime: openingTime }
      }

      continue
    }

    const minutesUntilOpen = offset * 24 * 60 - nowMinutes + openingMinutes
    if (minutesUntilOpen >= 0) {
      return { minutesUntilOpen, nextOpeningTime: openingTime }
    }
  }

  return { minutesUntilOpen: null, nextOpeningTime: fallbackOpeningTime || null }
}

export const getRestaurantAvailabilityStatus = (restaurant, now = new Date(), options = {}) => {
  if (!restaurant) {
    return {
      isOpen: false,
      isActive: false,
      isAcceptingOrders: false,
      isWithinTimings: false,
      reason: "missing-restaurant",
    }
  }

  const ignoreOperationalStatus = options?.ignoreOperationalStatus === true
  const isActive = restaurant.isActive !== false
  const isAcceptingOrders = restaurant.isAcceptingOrders !== false
  const canOperate = ignoreOperationalStatus ? true : isActive

  if (!canOperate) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "inactive",
    }
  }

  const dayName = DAY_NAMES[now.getDay()]
  const todayTiming = getTodayTiming(restaurant, dayName)

  // Legacy openDays can get stale; enforce only when no explicit outlet timing exists for today.
  if (!isDayAvailable(restaurant, dayName, todayTiming)) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: todayTiming?.isOpen === false ? "day-closed" : "closed-day",
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
  const minutesUntilClose = isWithinTimings
    ? getMinutesUntilClosing(nowMinutes, openingMinutes, closingMinutes)
    : null
  const nextOpening = isWithinTimings
    ? { minutesUntilOpen: 0, nextOpeningTime: openingTime }
    : getMinutesUntilNextOpening(restaurant, now, openingTime)

  const isOpen = canOperate && isAcceptingOrders

  return {
    isOpen,
    isActive,
    isAcceptingOrders,
    isWithinTimings,
    openingTime,
    closingTime,
    minutesUntilClose,
    minutesUntilOpen: nextOpening.minutesUntilOpen,
    closingCountdownLabel: isOpen && isWithinTimings
      ? formatClosingCountdown(minutesUntilClose, closingTime)
      : null,
    openingCountdownLabel: isWithinTimings
      ? null
      : formatOpeningCountdown(nextOpening.minutesUntilOpen, nextOpening.nextOpeningTime),
    reason: !isAcceptingOrders
      ? "manual-offline"
      : (isWithinTimings
        ? "open"
        : (hasExplicitWindow ? "outside-hours-online" : "online-no-timings")),
  }
}
