import { useState, useMemo, useEffect } from "react"
import { Search, CheckCircle2, XCircle, Eye, Clock, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

export default function FoodApproval() {
  const [foodRequests, setFoodRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [processing, setProcessing] = useState(false)

  // Fetch pending food approval requests
  const fetchFoodRequests = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getPendingFoodApprovals()
      const data = response?.data?.data?.requests || response?.data?.requests || []
      setFoodRequests(data)
    } catch (error) {
      console.error('Error fetching food approval requests:', error)
      toast.error('Failed to load food approval requests')
      setFoodRequests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFoodRequests()
  }, [])

  // Filter requests based on search query
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) {
      return foodRequests
    }
    const query = searchQuery.toLowerCase().trim()
    return foodRequests.filter((request) =>
      request.itemName?.toLowerCase().includes(query) ||
      request.category?.toLowerCase().includes(query) ||
      request.restaurantName?.toLowerCase().includes(query) ||
      request.restaurantId?.toLowerCase().includes(query) ||
      request.sectionName?.toLowerCase().includes(query)
    )
  }, [foodRequests, searchQuery])

  const totalRequests = filteredRequests.length

  // Handle approve food item
  const handleApprove = async (request) => {
    try {
      setProcessing(true)
      await adminAPI.approveFoodItem(request._id || request.id)
      toast.success('Food item approved successfully')
      await fetchFoodRequests()
      setShowDetailModal(false)
      setSelectedRequest(null)
    } catch (error) {
      console.error('Error approving food item:', error)
      toast.error(error?.response?.data?.message || 'Failed to approve food item')
    } finally {
      setProcessing(false)
    }
  }

  // Handle reject food item
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }

    try {
      setProcessing(true)
      await adminAPI.rejectFoodItem(selectedRequest._id || selectedRequest.id, rejectReason)
      toast.success('Food item rejected')
      await fetchFoodRequests()
      setShowRejectModal(false)
      setShowDetailModal(false)
      setSelectedRequest(null)
      setRejectReason("")
    } catch (error) {
      console.error('Error rejecting food item:', error)
      toast.error(error?.response?.data?.message || 'Failed to reject food item')
    } finally {
      setProcessing(false)
    }
  }

  // View food item details
  const handleViewDetails = (request) => {
    console.log('Food item details:', {
      images: request.images,
      imagesLength: request.images?.length,
      image: request.image,
      item: request.item,
      itemImages: request.item?.images,
      itemImagesLength: request.item?.images?.length,
      fullRequest: request
    })
    setSelectedRequest(request)
    setShowDetailModal(true)
  }

  // Open reject modal
  const handleRejectClick = (request) => {
    setSelectedRequest(request)
    setShowRejectModal(true)
  }

  return (
    <div className="p-6 space-y-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
            Food Approval
          </h1>
        </div>
      </div>

      {/* Food Approval List Section */}
      <Card className="border border-gray-200 shadow-sm">
        <div className="p-4">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">Pending Food Approvals</h2>
              <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-600">
                {totalRequests}
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-2.5 flex items-center text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Ex: search by food name, restaurant name or ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#006fbd]" />
            </div>
          ) : (
            <div className="border-t border-gray-200">
              <div className="w-full overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead style={{ backgroundColor: "rgba(0, 111, 189, 0.1)" }}>
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        S.No
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Restaurant
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Food Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Section
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Requested Date
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-3 py-8 text-center text-sm text-gray-500">
                          {loading ? "Loading..." : "No pending food approval requests found."}
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((request, index) => (
                        <tr key={request._id || request.id} className="hover:bg-gray-50">
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            {index + 1}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.restaurantName || '-'}</div>
                              <div className="text-gray-500 text-xs">{request.restaurantId || '-'}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                            {request.category || request.item?.category || '-'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            {request.itemName || '-'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                            {request.sectionName || '-'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            ₹{request.price || '0.00'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                            {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleViewDetails(request)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors"
                                style={{ backgroundColor: "#006fbd" }}
                                onMouseEnter={(e) => (e.target.style.backgroundColor = "#005a9e")}
                                onMouseLeave={(e) => (e.target.style.backgroundColor = "#006fbd")}
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={processing}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Approve"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRejectClick(request)}
                                disabled={processing}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Food Details Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 bg-white">
          <DialogHeader className="p-6 pb-4 border-b border-gray-200">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Food Item Details
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Review the food item details before approval.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="p-6 space-y-4">
              {/* Restaurant Info */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="font-semibold text-sm text-gray-900 mb-2">Restaurant Information</h3>
                <p className="text-sm text-gray-700"><span className="font-medium">Name:</span> {selectedRequest.restaurantName || '-'}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">ID:</span> {selectedRequest.restaurantId || '-'}</p>
              </div>

              {/* Food Item Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Food Name</label>
                  <p className="text-sm text-gray-900">{selectedRequest.itemName || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <p className="text-sm text-gray-900">{selectedRequest.category || selectedRequest.item?.category || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                  <p className="text-sm text-gray-900">{selectedRequest.sectionName || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <p className="text-sm text-gray-900 font-semibold">₹{selectedRequest.price || '0.00'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Food Type</label>
                  <p className="text-sm text-gray-900">{selectedRequest.foodType || '-'}</p>
                </div>
                {selectedRequest.description && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <p className="text-sm text-gray-900">{selectedRequest.description}</p>
                  </div>
                )}
                {(() => {
                  // Collect all images - from images array, single image field, and item.images as fallback
                  const allImages = [];
                  
                  // First, try images array from request
                  if (selectedRequest.images && Array.isArray(selectedRequest.images) && selectedRequest.images.length > 0) {
                    const validImages = selectedRequest.images.filter(img => img && typeof img === 'string' && img.trim() !== '');
                    allImages.push(...validImages);
                    console.log('Added images from request.images:', validImages.length, validImages);
                  }
                  
                  // Also check item.images (even if request.images exists, item.images might have more)
                  if (selectedRequest.item?.images && Array.isArray(selectedRequest.item.images) && selectedRequest.item.images.length > 0) {
                    const validItemImages = selectedRequest.item.images.filter(img => 
                      img && typeof img === 'string' && img.trim() !== '' && !allImages.includes(img)
                    );
                    allImages.push(...validItemImages);
                    console.log('Added images from item.images:', validItemImages.length, validItemImages);
                  }
                  
                  // Add single image if it exists and not already in array
                  const singleImage = selectedRequest.image || selectedRequest.item?.image;
                  if (singleImage && singleImage.trim() !== '' && !allImages.includes(singleImage)) {
                    allImages.push(singleImage);
                    console.log('Added single image:', singleImage);
                  }
                  
                  console.log('Total images collected:', allImages.length, allImages);
                  
                  return allImages.length > 0 ? (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Images ({allImages.length})
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {allImages.map((img, idx) => (
                          img && img.trim() !== '' ? (
                            <img 
                              key={idx}
                              src={img} 
                              alt={`${selectedRequest.itemName} - Image ${idx + 1}`}
                              className="w-32 h-32 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors cursor-pointer"
                              onClick={() => window.open(img, '_blank')}
                              title="Click to view full size"
                              onError={(e) => {
                                console.error('Image failed to load:', img);
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : null
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          )}
          <DialogFooter className="p-6 pt-4 border-t border-gray-200 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowDetailModal(false)
                setSelectedRequest(null)
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => handleRejectClick(selectedRequest)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => handleApprove(selectedRequest)}
              disabled={processing}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? "Processing..." : "Approve"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md p-0 bg-white">
          <DialogHeader className="p-6 pb-4 border-b border-gray-200">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Reject Food Item
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Please provide a reason for rejecting this food item.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="rejectReason" className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  required
                  rows={4}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#006fbd] focus:border-[#006fbd]"
                />
              </div>
            </div>
            <DialogFooter className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectReason("")
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={processing || !rejectReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? "Processing..." : "Reject"}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

