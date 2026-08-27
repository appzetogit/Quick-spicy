import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import FreebieTierEditor from "../components/FreebieTierEditor"

/**
 * Restaurant panel: "spend X, get Y free".
 *
 * Deliberately separate from the Create Offers wizard under Hub & Growth. That flow
 * produces an Offer document with goals, timings and targeting - none of which the order
 * pricing reads for freebies, so anything configured there never reached a customer.
 * This page writes the configuration the checkout actually consults.
 */
export default function FreeItemOnOrderValue() {
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState([])
  const [addons, setAddons] = useState([])
  const [loadingChoices, setLoadingChoices] = useState(true)

  useEffect(() => {
    let cancelled = false

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

    Promise.allSettled([restaurantAPI.getMenu(), restaurantAPI.getAddons()])
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
  }, [])

  const load = useCallback(async () => {
    const res = await restaurantAPI.getFreebieOffer()
    return res?.data?.data?.freebieOffer || { isActive: false, tiers: [] }
  }, [])

  const save = useCallback(async (payload) => {
    return restaurantAPI.updateFreebieOffer(payload)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Free item on order value</h1>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">
        <FreebieTierEditor
          load={load}
          save={save}
          menuItems={menuItems}
          addons={addons}
          loadingChoices={loadingChoices}
        />
      </div>
    </div>
  )
}
