export const INDIA_TIME_ZONE = "Asia/Kolkata"

const indiaDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: INDIA_TIME_ZONE,
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

const buildPartsMap = (date) => {
  const parts = indiaDateTimeFormatter.formatToParts(date)
  return parts.reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value
    }
    return acc
  }, {})
}

export const getIndiaDateTimeParts = (date = new Date()) => {
  const parts = buildPartsMap(date)
  const hours = Number(parts.hour || 0)
  const minutes = Number(parts.minute || 0)
  const seconds = Number(parts.second || 0)

  return {
    weekday: parts.weekday || "",
    year: Number(parts.year || 0),
    month: Number(parts.month || 0),
    day: Number(parts.day || 0),
    hours,
    minutes,
    seconds,
    totalMinutes: hours * 60 + minutes,
  }
}

export const formatIndiaDateTime = (date = new Date(), options = {}) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(date)
