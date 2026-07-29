import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, MapPin, Search, Users } from "lucide-react"
import { zoneAPI } from "@/lib/api"
import { useOrderForSomeoneElse } from "../hooks/useOrderForSomeoneElse"

/**
 * Pick the zone the food is going to, then browse that zone normally.
 *
 * Restaurant visibility otherwise follows the customer's own GPS zone. This screen is the
 * explicit way to order somewhere else, replacing the old zone picker that changed the
 * catalogue silently and produced orders restaurants had to cancel.
 */
export default function OrderForSomeoneElse() {
  const navigate = useNavigate()
  const { active, zoneId, zoneName, startForZone, clear } = useOrderForSomeoneElse()

  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState("")

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
        if (!cancelled) setError(err?.response?.data?.message || "Could not load delivery areas")
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const visibleZones = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return zones
    return zones.filter((z) =>
      [z?.name, z?.zoneName, z?.serviceLocation, z?.city].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    )
  }, [zones, search])

  const chooseZone = (zone) => {
    const id = zone?._id || zone?.id
    if (!id) return
    startForZone(id, zone?.name || zone?.zoneName || "Selected area")
    navigate("/user")
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#121212] pb-24">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#1a1a1a] border-b border-slate-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate(-1)} aria-label="Go back" className="p-1">
            <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-gray-100">Order for someone else</h1>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Choose where the food should be delivered
            </p>
          </div>
        </div>
      </div>

      {active && zoneId && (
        <div className="mx-4 mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
          <p className="text-sm font-semibold text-green-900 dark:text-green-300">
            Ordering for someone in {zoneName || "another area"}
          </p>
          <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
            You&apos;ll enter their name and phone number at checkout.
          </p>
          <button
            type="button"
            onClick={() => {
              clear()
              navigate("/user")
            }}
            className="mt-2 text-xs font-semibold text-green-800 underline dark:text-green-300"
          >
            Switch back to ordering for myself
          </button>
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search area or city"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-100"
          />
        </div>
      </div>

      <div className="px-4 py-4">
        {loading && <p className="py-10 text-center text-sm text-slate-500">Loading delivery areas...</p>}
        {error && !loading && <p className="py-10 text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && visibleZones.length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No delivery areas match that search.</p>
          </div>
        )}

        <div className="space-y-2">
          {visibleZones.map((zone) => {
            const id = String(zone?._id || zone?.id || "")
            const isSelected = active && String(zoneId || "") === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => chooseZone(zone)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "border-green-600 bg-green-50 dark:bg-green-950"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-800 dark:bg-[#1a1a1a]"
                }`}
              >
                <MapPin className={`h-4 w-4 shrink-0 ${isSelected ? "text-green-700" : "text-slate-400"}`} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-900 dark:text-gray-100">
                    {zone?.name || zone?.zoneName || "Delivery area"}
                  </span>
                  {(zone?.serviceLocation || zone?.city) && (
                    <span className="block text-xs text-slate-500 dark:text-gray-400">
                      {zone.serviceLocation || zone.city}
                    </span>
                  )}
                </span>
                {isSelected && <span className="text-xs font-semibold text-green-700">Selected</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
