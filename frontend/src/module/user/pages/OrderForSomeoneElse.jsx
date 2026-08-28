import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronRight, MapPin, Search, Star, Users } from "lucide-react"
import { restaurantAPI, zoneAPI } from "@/lib/api"
import { useOrderForSomeoneElse } from "../hooks/useOrderForSomeoneElse"
import { safeBack } from "../utils/safeBack"
import { sortOpenRestaurantsFirst } from "@/lib/utils/restaurantAvailability"

/**
 * Pick the area the food is going to, then browse that area's restaurants without leaving
 * this screen.
 *
 * Restaurant visibility otherwise follows the customer's own GPS zone. This is the explicit
 * way to order somewhere else, replacing the old zone picker that changed the catalogue
 * silently and produced orders restaurants had to cancel. Choosing a branch here reveals its
 * restaurants in place: bouncing back to the home page hid the result of the choice and made
 * it look as though nothing had happened.
 */
export default function OrderForSomeoneElse() {
  const navigate = useNavigate()
  const { active, zoneId, zoneName, startForZone, clear } = useOrderForSomeoneElse()

  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [zonesError, setZonesError] = useState(null)
  const [zoneSearch, setZoneSearch] = useState("")

  const [restaurants, setRestaurants] = useState([])
  const [restaurantsLoading, setRestaurantsLoading] = useState(false)
  const [restaurantsError, setRestaurantsError] = useState(null)

  // Choosing a branch reveals its restaurants below rather than navigating away.
  const [showRestaurants, setShowRestaurants] = useState(Boolean(active && zoneId))

  useEffect(() => {
    let cancelled = false
    zoneAPI
      .getZones()
      .then((res) => {
        if (cancelled) return
        const list = res?.data?.data?.zones || res?.data?.zones || res?.data?.data || []
        setZones(Array.isArray(list) ? list.filter((z) => z?.isActive !== false) : [])
      })
      .catch((err) => {
        if (!cancelled) setZonesError(err?.response?.data?.message || "Could not load delivery areas")
      })
      .finally(() => !cancelled && setZonesLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const loadRestaurants = useCallback(async (targetZoneId) => {
    if (!targetZoneId) return
    setRestaurantsLoading(true)
    setRestaurantsError(null)
    try {
      // No coordinates here on purpose: the server treats them as authoritative and would
      // snap the list back to the customer's own area, which is the opposite of the intent.
      const res = await restaurantAPI.getRestaurants({ zoneId: targetZoneId, limit: 100, _ts: Date.now() })
      const list = res?.data?.data?.restaurants || res?.data?.restaurants || []
      // Closed stores sink below open ones here too (#022).
      setRestaurants(sortOpenRestaurantsFirst(Array.isArray(list) ? list : []))
    } catch (err) {
      setRestaurantsError(err?.response?.data?.message || "Could not load restaurants for this area")
      setRestaurants([])
    } finally {
      setRestaurantsLoading(false)
    }
  }, [])

  // Reload whenever the chosen area changes, including on a fresh visit while already active.
  useEffect(() => {
    if (showRestaurants && zoneId) loadRestaurants(zoneId)
  }, [showRestaurants, zoneId, loadRestaurants])

  const visibleZones = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase()
    if (!q) return zones
    return zones.filter((z) =>
      [z?.name, z?.zoneName, z?.serviceLocation, z?.city].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    )
  }, [zones, zoneSearch])

  const chooseZone = (zone) => {
    const id = zone?._id || zone?.id
    if (!id) return
    startForZone(id, zone?.name || zone?.zoneName || "Selected area")
    setShowRestaurants(true)
  }

  const changeArea = () => {
    setShowRestaurants(false)
    setRestaurants([])
  }

  const cancelMode = () => {
    clear()
    setShowRestaurants(false)
    setRestaurants([])
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#121212] pb-28">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#1a1a1a] border-b border-slate-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => (showRestaurants ? changeArea() : safeBack(navigate))}
            aria-label="Go back"
            className="p-1"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-gray-300" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 dark:text-gray-100">Order for someone else</h1>
            <p className="truncate text-xs text-slate-500 dark:text-gray-400">
              {showRestaurants && zoneName
                ? `Delivering to ${zoneName}`
                : "Choose where the food should be delivered"}
            </p>
          </div>
        </div>
      </div>

      {/* Step 1 - choose the area */}
      {!showRestaurants && (
        <>
          <div className="px-4 pt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={zoneSearch}
                onChange={(e) => setZoneSearch(e.target.value)}
                placeholder="Search area or city"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-100"
              />
            </div>
          </div>

          <div className="px-4 py-4">
            {zonesLoading && <p className="py-10 text-center text-sm text-slate-500">Loading delivery areas...</p>}
            {zonesError && !zonesLoading && <p className="py-10 text-center text-sm text-red-600">{zonesError}</p>}

            {!zonesLoading && !zonesError && visibleZones.length === 0 && (
              <div className="py-12 text-center">
                <Users className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">No delivery areas match that search.</p>
              </div>
            )}

            <div className="space-y-2">
              {visibleZones.map((zone) => {
                const id = String(zone?._id || zone?.id || "")
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => chooseZone(zone)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:border-gray-800 dark:bg-[#1a1a1a]"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-gray-100">
                        {zone?.name || zone?.zoneName || "Delivery area"}
                      </span>
                      {(zone?.serviceLocation || zone?.city) && (
                        <span className="block truncate text-xs text-slate-500 dark:text-gray-400">
                          {zone.serviceLocation || zone.city}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Step 2 - that area's restaurants, in place */}
      {showRestaurants && (
        <>
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-green-900 dark:text-green-300">
                {zoneName || "Selected area"}
              </p>
              <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
                You&apos;ll add their name and number at checkout.
              </p>
            </div>
            <button
              type="button"
              onClick={changeArea}
              className="shrink-0 rounded-lg border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-800 dark:border-green-800 dark:text-green-300"
            >
              Change
            </button>
          </div>

          <div className="px-4 py-4">
            {restaurantsLoading && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-gray-800" />
                ))}
              </div>
            )}

            {restaurantsError && !restaurantsLoading && (
              <p className="py-10 text-center text-sm text-red-600">{restaurantsError}</p>
            )}

            {!restaurantsLoading && !restaurantsError && restaurants.length === 0 && (
              <div className="py-12 text-center">
                <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-gray-300">
                  No restaurants in {zoneName || "this area"} yet
                </p>
                <button type="button" onClick={changeArea} className="mt-3 text-sm font-semibold text-green-700 underline">
                  Choose a different area
                </button>
              </div>
            )}

            {!restaurantsLoading && restaurants.length > 0 && (
              <>
                <p className="mb-3 text-xs font-medium text-slate-500 dark:text-gray-400">
                  {restaurants.length} {restaurants.length === 1 ? "restaurant" : "restaurants"} delivering here
                </p>
                <div className="space-y-3">
                  {restaurants.map((restaurant) => {
                    const slug = restaurant?.slug || restaurant?._id
                    // profileImage comes back as { url }, not a string; passing the object
                    // straight to <img src> rendered nothing at all.
                    const pick = (v) => (typeof v === "string" ? v : v?.url || v?.secure_url || "")
                    const image =
                      pick(restaurant?.profileImage) ||
                      pick(restaurant?.image) ||
                      pick(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages[0] : restaurant?.coverImages) ||
                      pick(Array.isArray(restaurant?.menuImages) ? restaurant.menuImages[0] : restaurant?.menuImages)
                    const cuisines = Array.isArray(restaurant?.cuisines) ? restaurant.cuisines.slice(0, 2).join(", ") : ""
                    return (
                      <Link
                        key={String(restaurant?._id || slug)}
                        to={`/user/restaurants/${slug}`}
                        className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-[#1a1a1a]"
                      >
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-gray-800">
                          {image ? (
                            <img src={image} alt={restaurant?.name || "Restaurant"} className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">
                            {restaurant?.name || "Restaurant"}
                          </p>
                          {cuisines && (
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{cuisines}</p>
                          )}
                          <div className="mt-1.5 flex items-center gap-3">
                            <span className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-gray-300">
                              {Number(restaurant?.rating) > 0 ? (
                                <>
                                  <Star className="h-3 w-3 fill-green-600 text-green-600" />
                                  {Number(restaurant.rating).toFixed(1)}
                                </>
                              ) : (
                                <span className="text-slate-400">New</span>
                              )}
                            </span>
                            {restaurant?.deliveryTime && (
                              <span className="text-xs text-slate-500 dark:text-gray-400">{restaurant.deliveryTime}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={cancelMode}
              className="mt-6 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 dark:border-gray-700 dark:text-gray-400"
            >
              Cancel and order for myself
            </button>
          </div>
        </>
      )}
    </div>
  )
}
