import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/lib/api/axios"

/**
 * Promotional banner carousel shown below the categories row.
 *
 * Auto-advances, but pauses while the customer is dragging and while the tab is hidden, so a
 * banner does not slide out from under a thumb mid-swipe and a backgrounded tab does not
 * churn through the whole set unseen.
 *
 * Renders nothing at all when there are no banners: an empty strip or a lone placeholder
 * looks like a loading failure.
 */
const AUTO_ADVANCE_MS = 4500

export default function OfferBannerCarousel({ zoneId }) {
  const navigate = useNavigate()
  const [banners, setBanners] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  const trackRef = useRef(null)
  const pausedRef = useRef(false)
  const touchStartXRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api
      .get("/hero-banners/offer-banners/public", { params: zoneId ? { zoneId } : {} })
      .then((res) => {
        if (cancelled) return
        const list = res?.data?.data?.banners || []
        setBanners(Array.isArray(list) ? list : [])
        setIndex(0)
      })
      .catch(() => {
        if (!cancelled) setBanners([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  const go = useCallback(
    (next) => {
      if (banners.length === 0) return
      // Modulo with the length added first so stepping back from 0 wraps to the end.
      setIndex(((next % banners.length) + banners.length) % banners.length)
    },
    [banners.length],
  )

  useEffect(() => {
    if (banners.length <= 1) return undefined
    const timer = setInterval(() => {
      if (pausedRef.current) return
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      setIndex((prev) => (prev + 1) % banners.length)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(timer)
  }, [banners.length])

  const openBanner = (banner) => {
    const link = String(banner?.linkUrl || "").trim()
    if (!link) return // decorative banner
    if (/^https?:\/\//i.test(link)) {
      window.open(link, "_blank", "noopener,noreferrer")
      return
    }
    navigate(link.startsWith("/") ? link : `/${link}`)
  }

  if (loading) {
    return (
      <div className="px-4 mt-4">
        <div className="h-28 sm:h-36 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    )
  }

  if (banners.length === 0) return null

  return (
    <div className="px-4 mt-4">
      <div
        className="relative overflow-hidden rounded-xl"
        onMouseEnter={() => { pausedRef.current = true }}
        onMouseLeave={() => { pausedRef.current = false }}
        onTouchStart={(e) => {
          pausedRef.current = true
          touchStartXRef.current = e.touches?.[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          pausedRef.current = false
          const start = touchStartXRef.current
          const end = e.changedTouches?.[0]?.clientX ?? null
          touchStartXRef.current = null
          // Ignore small movements so a tap on the banner is not read as a swipe.
          if (start == null || end == null || Math.abs(end - start) < 40) return
          go(end < start ? index + 1 : index - 1)
        }}
      >
        <div
          ref={trackRef}
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {banners.map((banner) => (
            <button
              key={banner._id}
              type="button"
              onClick={() => openBanner(banner)}
              className={`w-full shrink-0 ${banner.linkUrl ? "cursor-pointer" : "cursor-default"}`}
              aria-label={banner.title || "Offer banner"}
            >
              <img
                src={banner.imageUrl}
                alt={banner.title || "Offer"}
                className="h-28 sm:h-36 w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {banners.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
            {banners.map((banner, i) => (
              <button
                key={`dot-${banner._id}`}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to banner ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
