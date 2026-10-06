import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Receipt } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@/lib/api"

/**
 * Admin -> GST Settings.
 * GST is charged only for restaurants switched on here: at the restaurant's own rate if one
 * is set, otherwise the default rate at the top. Changes apply to orders placed afterwards.
 */
const FILTERS = [
  { value: "all", label: "All" },
  { value: "on", label: "GST on" },
  { value: "off", label: "GST off" },
  { value: "missing-gstin", label: "On, no GST number" },
]

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function GstSettings() {
  const [rows, setRows] = useState([])
  const [defaultRate, setDefaultRate] = useState(0)
  const [defaultRateInput, setDefaultRateInput] = useState("")
  const [enabledCount, setEnabledCount] = useState(0)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminAPI.getGstRestaurants({ search, filter, page, limit: 50 })
      const data = res?.data?.data || {}
      setRows(data.restaurants || [])
      setDefaultRate(Number(data.defaultRate ?? 0))
      setDefaultRateInput(String(data.defaultRate ?? 0))
      setEnabledCount(data.enabledCount || 0)
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load GST settings")
    } finally {
      setLoading(false)
    }
  }, [search, filter, page])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  useEffect(() => { setPage(1); setSelected(new Set()) }, [search, filter])

  const effectiveRate = (row) => (row.gst.rate ?? defaultRate)

  const saveRow = async (row, changes, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return false
    setBusy((b) => ({ ...b, [row.id]: true }))
    try {
      const res = await adminAPI.updateRestaurantGst(row.id, changes)
      const updated = res?.data?.data?.restaurant
      if (updated) setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      toast.success(`GST updated for ${row.name}`)
      return true
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update GST")
      return false
    } finally {
      setBusy((b) => ({ ...b, [row.id]: false }))
    }
  }

  const toggle = (row) => {
    const turningOn = !row.gst.enabled
    const rate = effectiveRate(row)
    return saveRow(
      row,
      { enabled: turningOn },
      turningOn
        ? `Charge ${rate}% GST on ${row.name}'s orders?\n\nCustomers pay it from their next order. Orders already placed are not affected.`
        : `Stop charging GST on ${row.name}'s orders?`,
    )
  }

  const saveDefaultRate = async () => {
    const rate = Number(defaultRateInput)
    if (!Number.isFinite(rate) || rate < 0 || rate > 28) {
      toast.error("Default GST rate must be between 0 and 28")
      return
    }
    if (rate === defaultRate) return
    if (!window.confirm(`Change the default GST rate from ${defaultRate}% to ${rate}%?\n\nThis applies to the ${enabledCount} restaurant(s) with GST on that have no custom rate.`)) return
    try {
      await adminAPI.updateDefaultGstRate(rate)
      toast.success("Default GST rate updated")
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update the default rate")
    }
  }

  const bulk = async (enabled) => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`${enabled ? "Switch GST ON" : "Switch GST OFF"} for ${ids.length} restaurant(s)?`)) return
    try {
      const res = await adminAPI.bulkUpdateRestaurantGst({ ids, enabled })
      toast.success(res?.data?.message || "Updated")
      setSelected(new Set())
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Bulk update failed")
    }
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const openEdit = (row) =>
    setEditing({
      row,
      rate: row.gst.rate ?? "",
      gstin: row.gst.gstin || row.signupGstin || "",
      legalName: row.gst.legalName || row.signupLegalName || "",
    })

  const saveEdit = async (e) => {
    e.preventDefault()
    const ok = await saveRow(editing.row, {
      rate: String(editing.rate).trim() === "" ? null : Number(editing.rate),
      gstin: editing.gstin,
      legalName: editing.legalName,
    })
    if (ok) setEditing(null)
  }

  const summary = useMemo(
    () => `${enabledCount} restaurant(s) charging GST · default rate ${defaultRate}%`,
    [enabledCount, defaultRate],
  )

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-1">
            <Receipt className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">GST Settings</h1>
          </div>
          <p className="text-sm text-slate-500">
            GST is added to a customer&apos;s bill only for restaurants switched on below. Each uses its own
            rate if set, otherwise the default rate. Changes apply to new orders only.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-700">{summary}</p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Default GST rate (%)</label>
              <input
                type="number" min="0" max="28" step="0.01"
                value={defaultRateInput}
                onChange={(e) => setDefaultRateInput(e.target.value)}
                className={`${inputClass} w-32`}
              />
            </div>
            <button
              type="button"
              onClick={saveDefaultRate}
              disabled={Number(defaultRateInput) === defaultRate}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40"
            >
              Save default rate
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search restaurant name or ID"
                className={`${inputClass} pl-9`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${filter === f.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-2">
              <span className="text-sm text-blue-900 font-medium">{selected.size} selected</span>
              <button type="button" onClick={() => bulk(true)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700">Switch GST on</button>
              <button type="button" onClick={() => bulk(false)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-800">Switch GST off</button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-600 underline">Clear</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left"><input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all on this page" /></th>
                  {["Restaurant", "Zone", "GST", "Rate", "GST number", "Last changed", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No restaurants match.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n })}
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.restaurantId}{row.isActive ? "" : " · inactive"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.zoneName || "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(row)}
                        disabled={!!busy[row.id]}
                        aria-label={`GST ${row.gst.enabled ? "on" : "off"} for ${row.name}`}
                        className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${row.gst.enabled ? "bg-green-600" : "bg-slate-300"} disabled:opacity-60`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${row.gst.enabled ? "translate-x-7" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {row.gst.enabled ? `${effectiveRate(row)}%` : "—"}
                      {row.gst.enabled && <span className="block text-[11px] text-slate-400">{row.gst.rate == null ? "default" : "custom"}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700">
                      {row.gst.gstin || (row.gst.enabled ? <span className="font-sans text-xs text-amber-600">Missing</span> : "—")}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.gst.updatedAt ? new Date(row.gst.updatedAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      {row.gst.updatedBy && <span className="block">{row.gst.updatedBy}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => openEdit(row)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 text-sm">
              <span className="text-slate-500">{pagination.total} restaurants</span>
              <div className="flex gap-2 items-center">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Previous</button>
                <span>Page {pagination.page} of {pagination.pages}</span>
                <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <form onSubmit={saveEdit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">GST for {editing.row.name}</h2>
              <p className="text-xs text-slate-500 mt-1">Applies to new orders. Turn GST on or off with the switch in the table.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Custom GST rate (%)</label>
              <input type="number" min="0" max="28" step="0.01" value={editing.rate} onChange={(e) => setEditing((p) => ({ ...p, rate: e.target.value }))} placeholder={`Empty = default (${defaultRate}%)`} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">GST number (GSTIN)</label>
              <input value={editing.gstin} onChange={(e) => setEditing((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="e.g. 37ABCDE1234F1Z5" maxLength={15} className={`${inputClass} font-mono`} />
              {!editing.row.gst.gstin && editing.row.signupGstin && <p className="mt-1 text-[11px] text-slate-500">Filled from the restaurant&apos;s signup details.</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Legal name (on invoices)</label>
              <input value={editing.legalName} onChange={(e) => setEditing((p) => ({ ...p, legalName: e.target.value }))} className={inputClass} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={!!busy[editing.row.id]} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
