/**
 * Local calendar dates for <input type="date"> values and comparisons.
 *
 * The one-liner everyone reaches for - new Date().toISOString().split('T')[0] -
 * converts to UTC first. India is UTC+5:30, so from 5:30pm onwards it returns
 * YESTERDAY. Every screen that used it for "today" spent the evening with date
 * minimums, validation, and defaults quietly off by one: coupons could be given
 * an end date in the past, addon windows could start yesterday, and "today" was
 * unpickable in date fields that capped at it.
 *
 * These format from local date parts, so they agree with the calendar on the wall.
 */

/** @param {Date} [date] @returns {string} e.g. "2026-08-27" in local time */
export const toLocalISODate = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today's local calendar date, for min/max attributes and validity checks. */
export const todayLocalISO = () => toLocalISODate(new Date())
