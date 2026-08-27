import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Loader2, Gift } from "lucide-react"
import { adminAPI, restaurantAPI } from "@/lib/api"
import FreebieTierEditor from "@/module/restaurant/components/FreebieTierEditor"

/**
 * Admin: "spend X, get Y free" for any restaurant.
 *
 * Restaurants configure their own scheme in their panel; this is the same configuration
 * through the same API, so support can set one up or correct one without asking the
 * restaurant to do it. The editor component is shared for exactly that reason - two
 * copies of a form that writes money-adjacent settings will eventually disagree.
 */
export default function RestaurantFreebies() {
  const [restaurants, setRestaurants] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)

  const [menuItems, setMenuItems] = useState([])
  const [addons, setAddons] = useState([])
  const [loadingChoices, setLoadingChoices] = useState(false)

  useEffect(() => {
    let cancelled = false
    adminAPI.getRestaurants({ limit: 1000 })
      .then((res) => {
        if (cancelled) return
        const list = res?.data?.data?.restaurants || res?.data?.data || []
        setRestaurants(Array.isArray(list) ? list : [])
      })
      .catch(() => !cancelled && setRestaurants([]))
      .finally(() => !cancelled && setLoadingList(false))
    return () => { cancelled = true }
  }, [])

  // Reward choices belong to the selected restaurant, so they reload on every change.
  useEffect(() => {
    if (!selected?._id) { setMenuItems([]); setAddons([]); return }
    let cancelled = false
    setLoadingChoices(true)

    const flattenMenu = (menu) => {
      const out = []
      const push = (items) => (items || []).forEach((it) => {
        const id = it?.id || it?._id
        if (!id || !it?.name) return
        out.push({
          id: String(id),
          name: it.name,
          price: Number(it.price) || 0,
          image: it.image || "",
          isVeg: it.foodType ? it.foodType === "Veg" : (typeof it.isVeg === "boolean" ? it.isVeg : null),
        })
      })
      ;(menu?.sections || []).forEach((s) => {
        push(s?.items)
        ;(s?.subsections || []).forEach((sub) => push(sub?.items))
      })
      return out
    }

    Promise.allSettled([
      restaurantAPI.getMenuByRestaurantId(selected._id),
      restaurantAPI.getAddonsByRestaurantId(selected._id),
    ])
      .then(([menuRes, addonRes]) => {
        if (cancelled) return
        const menu = menuRes.status === "fulfilled"
          ? (menuRes.value?.data?.data?.menu || menuRes.value?.data?.menu)
          : null
        setMenuItems(flattenMenu(menu))

        const rawAddons = addonRes.status === "fulfilled"
          ? (addonRes.value?.data?.data?.addons || addonRes.value?.data?.addons || [])
          : []
        setAddons((Array.isArray(rawAddons) ? rawAddons : []).map((a) => ({
          id: String(a?.id || a?._id || ""),
          name: a?.name || "",
          price: Number(a?.price) || 0,
          image: a?.image || "",
          isVeg: typeof a?.isVeg === "boolean" ? a.isVeg : null,
        })).filter((a) => a.id && a.name))
      })
      .finally(() => !cancelled && setLoadingChoices(false))

    return () => { cancelled = true }
  }, [selected?._id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return restaurants.slice(0, 60)
    return restaurants.filter((r) => String(r?.name || "").toLowerCase().includes(q)).slice(0, 60)
  }, [restaurants, query])

  const load = useCallback(async () => {
    if (!selected?._id) return { isActive: false, tiers: [] }
    const res = await adminAPI.getRestaurantFreebieOffer(selected._id)
    return res?.data?.data?.freebieOffer || { isActive: false, tiers: [] }
  }, [selected?._id])

  const save = useCallback(async (payload) => {
    return adminAPI.updateRestaurantFreebieOffer(selected._id, payload)
  }, [selected?._id])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#EB590E]" />
          Free item on order value
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Set up &quot;spend &#8377;200, get a free dish&quot; for a restaurant. Applied automatically
          at checkout - the customer types nothing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search restaurants..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#EB590E]"
              />
            </div>

            {loadingList ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 p-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading restaurants...
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <p className="p-3 text-sm text-slate-500">No restaurants match that search.</p>
                )}
                {filtered.map((r) => (
                  <button
                    key={r._id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${
                      selected?._id === r._id
                        ? "bg-orange-50 text-[#EB590E] font-semibold"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
              Choose a restaurant to set up its reward.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900 mb-4">{selected.name}</p>
              {/* Remounted per restaurant so the editor reloads that restaurant's saved
                  configuration instead of keeping the previous one on screen. */}
              <FreebieTierEditor
                key={selected._id}
                load={load}
                save={save}
                menuItems={menuItems}
                addons={addons}
                loadingChoices={loadingChoices}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
