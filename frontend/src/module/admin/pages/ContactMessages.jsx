import { useState, useEffect, useMemo } from "react"
import { Search, ArrowUpDown, Settings, Folder, ChevronDown, Eye, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import apiClient from "@/lib/api/axios"
import { API_ENDPOINTS } from "@/lib/api/config"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const debugError = (...args) => {}

export default function ContactMessages() {
  const [searchQuery, setSearchQuery] = useState("")
  const [feedbacks, setFeedbacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFeedback, setSelectedFeedback] = useState(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchFeedbacks()
  }, [statusFilter, currentPage, searchQuery])

  const fetchFeedbacks = async () => {
    try {
      setLoading(true)
      const params = {
        page: currentPage,
        limit: 10,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: searchQuery.trim() || undefined,
      }

      Object.keys(params).forEach((key) => params[key] === undefined && delete params[key])

      const response = await apiClient.get(API_ENDPOINTS.ADMIN.FEEDBACK, { params })

      if (response.data?.success) {
        setFeedbacks(response.data.data?.feedbacks || [])
        setTotalPages(response.data.data?.pagination?.pages || 1)
      } else {
        setFeedbacks([])
        setTotalPages(1)
      }
    } catch (error) {
      debugError("Error fetching feedbacks:", error)
      setFeedbacks([])
      setTotalPages(1)
      toast.error(
        error.response?.data?.message ||
          error.message ||
          "Failed to load feedbacks. Please check your connection and try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  const handleViewFeedback = (feedback) => {
    setSelectedFeedback(feedback)
    setIsViewDialogOpen(true)
  }

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const response = await apiClient.put(`${API_ENDPOINTS.ADMIN.FEEDBACK}/${id}/status`, {
        status: newStatus,
      })

      if (response.data?.success) {
        toast.success("Status updated successfully")
        fetchFeedbacks()
      }
    } catch (error) {
      debugError("Error updating feedback status:", error)
      toast.error("Failed to update feedback status")
    }
  }

  const filteredFeedbacks = useMemo(() => {
    if (!searchQuery.trim()) {
      return feedbacks
    }

    const query = searchQuery.toLowerCase().trim()
    return feedbacks.filter((feedback) =>
      feedback.userName?.toLowerCase().includes(query) ||
      feedback.userEmail?.toLowerCase().includes(query) ||
      feedback.message?.toLowerCase().includes(query),
    )
  }, [feedbacks, searchQuery])

  const getDisplayEmail = (feedback) => {
    const rawEmail = typeof feedback?.userEmail === "string" ? feedback.userEmail.trim() : ""
    if (!rawEmail) return "N/A"
    if (rawEmail.startsWith("Phone:") || rawEmail.startsWith("User ID:")) return "N/A"
    return rawEmail
  }

  const getDisplayPhone = (feedback) => {
    if (feedback?.userId?.phone) return feedback.userId.phone
    if (typeof feedback?.userEmail === "string" && feedback.userEmail.startsWith("Phone:")) {
      return feedback.userEmail.replace(/^Phone:\s*/, "").trim() || "N/A"
    }
    return "N/A"
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      unread: { label: "Unread", className: "bg-blue-100 text-blue-700" },
      read: { label: "Read", className: "bg-slate-100 text-slate-700" },
      replied: { label: "Replied", className: "bg-green-100 text-green-700" },
    }

    const config = statusConfig[status] || statusConfig.unread
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    )
  }

  if (loading && feedbacks.length === 0) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading feedbacks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">User Feedback</h1>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {feedbacks.length}
            </span>
          </div>

          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              <option value="all">All Status</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="replied">Replied</option>
            </select>

            <div className="relative flex-1 sm:flex-initial min-w-[250px]">
              <input
                type="text"
                placeholder="Ex: Search by name, email or message"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>SI</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Name</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Email</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Phone</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Feedback</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <span>Action</span>
                    <Settings className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredFeedbacks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20">
                    <div className="flex flex-col items-center justify-center">
                      <div className="relative mb-6">
                        <div className="w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center shadow-inner">
                          <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-md relative overflow-visible">
                            <Folder className="w-12 h-12 text-slate-400" />
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-3 bg-orange-500 rounded-t-md z-10"></div>
                            <div className="absolute top-3 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center z-10">
                              <span className="text-white text-xs font-bold">!</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-lg font-semibold text-slate-700">No Feedback Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFeedbacks.map((feedback, index) => (
                  <tr key={feedback._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">
                        {(currentPage - 1) * 10 + index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{feedback.userName || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{getDisplayEmail(feedback)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{getDisplayPhone(feedback)}</span>
                    </td>
                    <td className="px-6 py-4 max-w-md">
                      <span className="text-sm text-slate-700 line-clamp-2">{feedback.message}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(feedback.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded text-slate-600 hover:bg-slate-100 transition-colors">
                            <Settings className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={8} className="z-[140]">
                          <DropdownMenuItem onClick={() => handleViewFeedback(feedback)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(
                                feedback._id,
                                feedback.status === "unread" ? "read" : "unread",
                              )
                            }
                          >
                            Mark as {feedback.status === "unread" ? "Read" : "Unread"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
            <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="h-6 w-6 text-blue-600" />
              User Feedback Details
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Complete information about the submitted feedback
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback && (
            <div className="px-6 py-6 space-y-6">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-3">
                  <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"></div>
                  User Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User Name</label>
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{selectedFeedback.userName || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email Address</label>
                    <p className="text-base font-semibold text-slate-900 dark:text-white break-all">{getDisplayEmail(selectedFeedback)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone Number</label>
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{getDisplayPhone(selectedFeedback)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</label>
                    <div>{getStatusBadge(selectedFeedback.status)}</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-3">
                  <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full"></div>
                  Feedback Message
                </h3>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {selectedFeedback.message || "N/A"}
                  </p>
                </div>
              </div>

              {selectedFeedback.adminReply && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-5 border border-green-200 dark:border-green-800">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-3">
                    <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-emerald-600 rounded-full"></div>
                    Admin Reply
                  </h3>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {selectedFeedback.adminReply}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Submitted At</label>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedFeedback.createdAt
                      ? new Date(selectedFeedback.createdAt).toLocaleString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => setIsViewDialogOpen(false)}
                  className="min-w-[100px]"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
