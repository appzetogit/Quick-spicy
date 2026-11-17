import { useEffect, useMemo, useState } from "react"
import { Loader2, MapPin, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

/**
 * Zone filter for delivery charges. Pick one or more zones and give them free delivery or
 * their own charges; zones with no rule use the platform-wide charges above. Applies to
 * new carts and orders immediately. Rider pay is not affected.
 */
const inputClass =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"

const describeRule = (rule, defaults) => {
  if (!rule) return `Default: ₹${defaults.deliveryFee} up to ${defaults.deliveryBaseDistanceKm} KM, + ₹${defaults.deliveryFeePerKm}/KM`
  if (rule.freeDelivery) return "FREE delivery"
  const fee = rule.deliveryFee ?? defaults.deliveryFee
  const base = rule.deliveryBaseDistanceKm ?? defaults.deliveryBaseDistanceKm
  const perKm = rule.deliveryFeePerKm ?? defaults.deliveryFeePerKm
  return `Custom: ₹${fee} up to ${base} KM, + ₹${perKm}/KM`
}

export default function ZoneDeliveryRules({ defaults }) {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [mode, setMode] = useState("free")
  const [custom, setCustom] = useState({ deliveryFee: "", deliveryBaseDistanceKm: "", deliveryFeePerKm: "" })

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getZoneFeeRules()
      setZones(res?.data?.data?.zones || [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load zones")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedNames = useMemo(
    () => zones.filter((z) => selected.has(z.zoneId)).map((z) => z.zoneName),
    [zones, selected],
  )
  const freeCount = zones.filter((z) => z.rule?.freeDelivery).length

  const toggleZone = (zoneId) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(zoneId) ? next.delete(zoneId) : next.add(zoneId)
      return next
    })

  const apply = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one zone")
      return
    }
    const what = mode === "free" ? "FREE delivery" : "these custom delivery charges"
    if (!window.confirm(`Apply ${what} to: ${selectedNames.join(", ")}?\n\nCustomers ordering from restaurants in these zones see it from their next cart.`)) return
    setSaving(true)
    try {
      const res = await adminAPI.saveZoneFeeRules({
        zoneIds: [...selected],
        freeDelivery: mode === "free",
        ...(mode === "custom" ? custom : {}),
      })
      toast.success(res?.data?.message || "Saved")
      setSelected(new Set())
      load()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const resetZone = async (zone) => {
    if (!window.confirm(`Return ${zone.zoneName} to the default delivery charges?`)) return
    try {
      await adminAPI.deleteZoneFeeRule(zone.zoneId)
      toast.success(`${zone.zoneName} now uses the default charges`)
      load()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not reset")
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="p-6">
        <div className="flex items-start gap-3 mb-1">
          <MapPin className="w-5 h-5 text-green-600 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Delivery Charges by Zone</h2>
            <p className="text-sm text-slate-500 mt-1">
              Select one or more zones to give them free delivery or their own charges. Zones without a rule
              use the default charges above. Takes effect immediately for new orders; rider pay is not affected.
            </p>
            {freeCount > 0 && (
              <p className="text-sm font-medium text-green-700 mt-2">{freeCount} zone(s) currently have FREE delivery</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-green-600" />
          </div>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        aria-label="Select all zones"
                        checked={zones.length > 0 && selected.size === zones.length}
                        onChange={() => setSelected(selected.size === zones.length ? new Set() : new Set(zones.map((z) => z.zoneId)))}
                      />
                    </th>
                    {["Zone", "Delivery charges now", "Last changed", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {zones.map((zone) => (
                    <tr key={zone.zoneId} className={selected.has(zone.zoneId) ? "bg-green-50" : "hover:bg-slate-50"}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${zone.zoneName}`}
                          checked={selected.has(zone.zoneId)}
                          onChange={() => toggleZone(zone.zoneId)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {zone.zoneName}
                        {!zone.isActive && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {zone.rule?.freeDelivery ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">FREE delivery</span>
                        ) : (
                          <span className={zone.rule ? "text-blue-700 font-medium" : "text-slate-500"}>{describeRule(zone.rule, defaults)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {zone.rule?.updatedAt
                          ? new Date(zone.rule.updatedAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                        {zone.rule?.updatedBy && <span className="block">{zone.rule.updatedBy}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {zone.rule && (
                          <button
                            type="button"
                            onClick={() => resetZone(zone)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            Use default
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">
                {selected.size === 0 ? "Select zones above, then choose:" : `Apply to ${selected.size} zone(s): ${selectedNames.join(", ")}`}
              </p>
              <div className="flex flex-wrap gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" name="zoneRuleMode" checked={mode === "free"} onChange={() => setMode("free")} />
                  <Truck className="w-4 h-4 text-green-600" /> Free delivery
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" name="zoneRuleMode" checked={mode === "custom"} onChange={() => setMode("custom")} />
                  Custom delivery charges
                </label>
              </div>
              {mode === "custom" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fixed charge (₹)</label>
                    <input type="number" min="0" step="1" value={custom.deliveryFee} onChange={(e) => setCustom({ ...custom, deliveryFee: e.target.value })} placeholder={`Default ₹${defaults.deliveryFee}`} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Base distance (KM)</label>
                    <input type="number" min="0" step="0.1" value={custom.deliveryBaseDistanceKm} onChange={(e) => setCustom({ ...custom, deliveryBaseDistanceKm: e.target.value })} placeholder={`Default ${defaults.deliveryBaseDistanceKm}`} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fee per extra KM (₹)</label>
                    <input type="number" min="0" step="1" value={custom.deliveryFeePerKm} onChange={(e) => setCustom({ ...custom, deliveryFeePerKm: e.target.value })} placeholder={`Default ₹${defaults.deliveryFeePerKm}`} className={inputClass} />
                  </div>
                  <p className="md:col-span-3 text-xs text-slate-500">Leave a field empty to keep the default value for it.</p>
                </div>
              )}
              <Button
                onClick={apply}
                disabled={saving || selected.size === 0}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "free" ? "Give free delivery" : "Save custom charges"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
