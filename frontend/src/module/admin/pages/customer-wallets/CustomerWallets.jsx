import { useState, useEffect, useCallback } from "react"
import { Loader2, Search, Wallet, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const RUPEE = "₹"

export default function CustomerWallets() {
  const [customers, setCustomers] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 25 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState("")
  const [editReason, setEditReason] = useState("")
  const [savingId, setSavingId] = useState(null)

  const fetchCustomers = useCallback(async (page = 1, searchTerm = "") => {
    try {
      setLoading(true)
      const response = await adminAPI.getCustomerWallets({ page, limit: 25, search: searchTerm })
      const payload = response?.data?.data
      setCustomers(payload?.customers || [])
      if (payload?.pagination) setPagination(payload.pagination)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load customer wallets")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCustomers(1, "")
  }, [fetchCustomers])

  // Typing straight into the server would fire a query per keystroke down a throttled link.
  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(1, search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search, fetchCustomers])

  const startEdit = (customer) => {
    setEditingId(customer._id)
    setEditValue(String(customer.balance ?? 0))
    setEditReason("")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue("")
    setEditReason("")
  }

  const saveBalance = async (customer) => {
    const target = Number(editValue)
    if (editValue === "" || !Number.isFinite(target) || target < 0) {
      toast.error("Balance must be a number of 0 or more")
      return
    }

    try {
      setSavingId(customer._id)
      const response = await adminAPI.updateCustomerWalletBalance(customer._id, {
        balance: target,
        reason: editReason.trim() || undefined,
      })
      const data = response?.data?.data
      if (response?.data?.success) {
        toast.success(
          `${customer.name || "Customer"}: ${RUPEE}${data?.balanceBefore ?? "?"} → ${RUPEE}${data?.balance ?? target}`
        )
        setCustomers((prev) =>
          prev.map((row) => (row._id === customer._id ? { ...row, balance: data?.balance ?? target } : row))
        )
        cancelEdit()
      } else {
        toast.error(response?.data?.message || "Failed to update balance")
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update balance")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white">Customer Wallets</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Every customer wallet balance. Editing one records the difference as a transaction, so
          the wallet history still adds up to the balance.
        </p>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or email"
          className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-black dark:text-white"
        />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141414] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#1a1a1a] text-left">
              <tr className="text-gray-600 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold text-right">Balance</th>
                <th className="px-4 py-3 font-semibold text-right">Txns</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((customer) => {
                  const isEditing = editingId === customer._id
                  return (
                    <tr
                      key={customer._id}
                      className="border-t border-gray-100 dark:border-gray-800 text-black dark:text-white"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{customer.name || "Unknown"}</div>
                        {customer.referralCode && (
                          <div className="text-xs text-gray-500">{customer.referralCode}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{customer.phone || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex flex-col items-end gap-2">
                            <input
                              type="number"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-28 h-9 px-2 text-right rounded border border-[#EB590E] bg-white dark:bg-[#1a1a1a]"
                            />
                            <input
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="w-48 h-9 px-2 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]"
                            />
                          </div>
                        ) : (
                          <span className="font-bold">
                            {RUPEE}
                            {Number(customer.balance ?? 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{customer.transactionCount ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              onClick={() => saveBalance(customer)}
                              disabled={savingId === customer._id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {savingId === customer._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(customer)}
                            className="border-[#EB590E] text-[#EB590E]"
                          >
                            <Wallet className="h-4 w-4 mr-1" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-gray-500">
          {pagination.total} customers - page {pagination.page} of {pagination.pages || 1}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page <= 1 || loading}
            onClick={() => fetchCustomers(pagination.page - 1, search.trim())}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page >= (pagination.pages || 1) || loading}
            onClick={() => fetchCustomers(pagination.page + 1, search.trim())}
          >
            Next
          </Button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3">Only a super admin can change a balance.</p>
    </div>
  )
}
