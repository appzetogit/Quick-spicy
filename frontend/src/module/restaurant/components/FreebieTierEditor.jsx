import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2, Loader2, Gift, AlertCircle } from "lucide-react"

/**
 * "Spend X, get Y free" editor.
 *
 * Shared by the restaurant panel and the admin panel. Both edit the same configuration
 * through the same API, so the form lives here once rather than being written twice and
 * drifting - which is how the two sides of a setting usually end up disagreeing.
 *
 * The caller supplies load/save functions and the reward choices, because the restaurant
 * fetches its own menu while an admin fetches a chosen restaurant's.
 */

const MAX_TIERS = 5

const emptyTier = () => ({
  minOrderValue: "",
  rewardType: "item",
  rewardId: "",
  rewardName: "",
  rewardImage: "",
  rewardIsVeg: null,
  rewardValue: 0,
  isActive: true,
})

export default function FreebieTierEditor({
  load,            // () => Promise<{ isActive, tiers }>
  save,            // (payload) => Promise<any>
  menuItems = [],  // [{ id, name, price, image, isVeg }]
  addons = [],     // [{ id, name, price, image, isVeg }]
  loadingChoices = false,
  disabled = false,
  disabledReason = "",
}) {
  const [isActive, setIsActive] = useState(false)
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.resolve(load())
      .then((cfg) => {
        if (cancelled) return
        setIsActive(Boolean(cfg?.isActive))
        setTiers(Array.isArray(cfg?.tiers) ? cfg.tiers.map((t) => ({ ...t })) : [])
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.message || e.message || "Could not load"))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choicesFor = (type) => (type === "addon" ? addons : menuItems)

  const updateTier = (index, patch) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))
    setSavedAt(null)
  }

  const pickReward = (index, type, rewardId) => {
    const chosen = choicesFor(type).find((c) => String(c.id) === String(rewardId))
    updateTier(index, {
      rewardType: type,
      rewardId: chosen ? String(chosen.id) : "",
      rewardName: chosen?.name || "",
      rewardImage: chosen?.image || "",
      rewardIsVeg: typeof chosen?.isVeg === "boolean" ? chosen.isVeg : null,
      rewardValue: Number(chosen?.price) || 0,
    })
  }

  // Duplicate thresholds make it arbitrary which reward a qualifying cart gets, so they
  // are flagged here rather than only being rejected by the server on save.
  const duplicateThresholds = useMemo(() => {
    const seen = new Set()
    const dupes = new Set()
    tiers.forEach((t) => {
      const v = Number(t.minOrderValue)
      if (!Number.isFinite(v) || v < 1) return
      if (seen.has(v)) dupes.add(v)
      seen.add(v)
    })
    return dupes
  }, [tiers])

  const handleSave = async () => {
    setError("")
    setSaving(true)
    try {
      await save({
        isActive,
        tiers: tiers.map((t) => ({ ...t, minOrderValue: Number(t.minOrderValue) })),
      })
      setSavedAt(new Date())
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading reward settings...
      </div>
    )
  }

  const activeTierCount = tiers.filter((t) => t.isActive !== false).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Gift className="h-5 w-5 text-[#EB590E]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Free item on order value</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Give a free dish or addon once the customer&apos;s order reaches an amount.
              It is added automatically - no coupon code.
            </p>
          </div>
        </div>
        <label className="inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={isActive}
            disabled={disabled}
            onChange={(e) => { setIsActive(e.target.checked); setSavedAt(null) }}
          />
          <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EB590E]" />
        </label>
      </div>

      {isActive && activeTierCount === 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Add at least one reward before switching this on, or customers will see nothing.</span>
        </div>
      )}

      <div className="space-y-3">
        {tiers.map((tier, index) => {
          const choices = choicesFor(tier.rewardType)
          const isDupe = duplicateThresholds.has(Number(tier.minOrderValue))
          return (
            <div key={index} className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Reward {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => { setTiers((p) => p.filter((_, i) => i !== index)); setSavedAt(null) }}
                  disabled={disabled}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  aria-label={`Remove reward ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    When the order reaches (&#8377;)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tier.minOrderValue}
                    disabled={disabled}
                    onChange={(e) => updateTier(index, { minOrderValue: e.target.value })}
                    placeholder="200"
                    className={`w-full px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#EB590E] ${
                      isDupe ? "border-rose-400" : "border-gray-300"
                    }`}
                  />
                  {isDupe && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      Another reward already uses this amount.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Give away a</label>
                  <select
                    value={tier.rewardType}
                    disabled={disabled}
                    onChange={(e) => pickReward(index, e.target.value, "")}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB590E]"
                  >
                    <option value="item">Dish from menu</option>
                    <option value="addon">Addon</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {tier.rewardType === "addon" ? "Addon" : "Dish"}
                  </label>
                  <select
                    value={tier.rewardId}
                    disabled={disabled || loadingChoices}
                    onChange={(e) => pickReward(index, tier.rewardType, e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#EB590E]"
                  >
                    <option value="">
                      {loadingChoices ? "Loading..." : `Select ${tier.rewardType === "addon" ? "an addon" : "a dish"}...`}
                    </option>
                    {/* A previously chosen reward that has since been removed from the menu
                        would otherwise vanish from the dropdown and look unset. */}
                    {tier.rewardId && !choices.some((c) => String(c.id) === String(tier.rewardId)) && (
                      <option value={tier.rewardId}>{tier.rewardName} (no longer on the menu)</option>
                    )}
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.price ? ` - ₹${c.price}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {tier.rewardName && Number(tier.minOrderValue) > 0 && (
                <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  Customers spending <strong>&#8377;{Number(tier.minOrderValue)}</strong> or more get{" "}
                  <strong>{tier.rewardName}</strong> free
                  {tier.rewardValue ? ` (worth ₹${tier.rewardValue})` : ""}.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {tiers.length < MAX_TIERS && (
        <button
          type="button"
          onClick={() => { setTiers((p) => [...p, emptyTier()]); setSavedAt(null) }}
          disabled={disabled}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-[#EB590E] hover:text-[#EB590E] transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4 inline mr-1 -mt-0.5" />
          Add a reward{tiers.length > 0 ? " tier" : ""}
        </button>
      )}

      {tiers.length > 1 && (
        <p className="text-xs text-gray-500">
          If an order qualifies for more than one, the customer gets the highest one only.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {disabled && disabledReason && (
        <p className="text-xs text-gray-500">{disabledReason}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || disabled}
          className="px-5 py-2.5 rounded-xl bg-[#EB590E] text-white text-sm font-semibold hover:bg-[#d14f0c] disabled:opacity-60 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
        {savedAt && !saving && (
          <span className="text-sm text-emerald-700">Saved. Live for customers now.</span>
        )}
      </div>
    </div>
  )
}
