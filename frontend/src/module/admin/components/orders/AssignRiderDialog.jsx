import { useEffect, useState } from "react"
import { Loader2, Phone } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const formatLastSeen = (minutes) => {
  if (minutes === null || minutes === undefined) return "App never reported"
  if (minutes < 60) return `App seen ${minutes} min ago`
  if (minutes < 48 * 60) return `App seen ${Math.round(minutes / 60)} hr ago`
  return `App seen ${Math.round(minutes / 1440)} days ago`
}

const Tag = ({ tone, children }) => {
  const tones = {
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    muted: "bg-slate-100 text-slate-600",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export default function AssignRiderDialog({ isOpen, onOpenChange, order, onAssigned }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)

  const orderKey = order?._id || order?.orderId || order?.id

  useEffect(() => {
    if (!isOpen || !orderKey) return undefined
    let cancelled = false

    setData(null)
    setSelectedId(null)
    setLoadError("")
    setLoading(true)

    adminAPI.getOrderDispatchRiders(orderKey)
      .then((response) => {
        if (!cancelled) setData(response?.data?.data || { candidates: [] })
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.response?.data?.message || "Could not load riders")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, orderKey])

  const candidates = data?.candidates || []
  const selected = candidates.find((rider) => rider.id === selectedId) || null

  const handleAssign = async () => {
    if (!selected || saving) return
    setSaving(true)
    try {
      await adminAPI.assignOrderRider(orderKey, selected.id)
      toast.success(`Assigned to ${selected.name}`)
      onAssigned?.(order)
      onOpenChange(false)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not assign the rider")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg bg-white p-6">
        <DialogHeader>
          <DialogTitle>Assign rider to {order?.orderId || order?.id}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-600">
          {data?.restaurantName || order?.restaurant}
          {data?.zoneName ? ` · ${data.zoneName}` : ""}
        </p>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}

        {loadError && <p className="py-6 text-center text-sm text-red-600">{loadError}</p>}

        {!loading && !loadError && candidates.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No approved riders found.</p>
        )}

        {candidates.length > 0 && (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {candidates.map((rider) => (
              <button
                key={rider.id}
                type="button"
                onClick={() => setSelectedId(rider.id)}
                aria-pressed={selectedId === rider.id}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedId === rider.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{rider.name}</span>
                  {rider.distanceKm !== null && (
                    <span className="text-xs text-slate-500">{rider.distanceKm} km away</span>
                  )}
                </div>
                {rider.phone && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <Phone className="h-3 w-3" />
                    {rider.phone}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Tag tone={rider.live ? "good" : "warn"}>{formatLastSeen(rider.positionAgeMinutes)}</Tag>
                  {data?.zoneName && (
                    <Tag tone={rider.inZone ? "good" : "muted"}>{rider.inZone ? "This zone" : "Other zone"}</Tag>
                  )}
                  {rider.activeOrders > 0 && <Tag tone="warn">{rider.activeOrders} active</Tag>}
                  {rider.overCashLimit && <Tag tone="warn">Over cash limit</Tag>}
                  {rider.declined && <Tag tone="warn">Declined this order</Tag>}
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && !selected.live && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {selected.name}'s app is not active, so they may not see this order. Call them to confirm.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selected || saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Assigning..." : "Assign rider"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
