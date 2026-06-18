export function buildSafeReturnUrl(pathname, query = "") {
  if (typeof window === "undefined" || !window.location) {
    return null
  }

  const { origin, hostname } = window.location
  if (!origin || !/^https?:\/\//i.test(origin)) {
    return null
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return null
  }

  try {
    const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`
    const normalizedQuery = query
      ? query.startsWith("?")
        ? query
        : `?${query}`
      : ""

    return new URL(`${normalizedPath}${normalizedQuery}`, origin).toString()
  } catch {
    return null
  }
}
