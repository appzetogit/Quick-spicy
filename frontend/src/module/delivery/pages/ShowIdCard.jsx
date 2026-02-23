import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { X, Loader2 } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function ShowIdCard() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [profileData, setProfileData] = useState(null)

  // Fetch delivery partner profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfileData(response.data.data.profile)
        } else {
          toast.error("Failed to load profile data")
        }
      } catch (error) {
        console.error("Error fetching profile:", error)
        toast.error("Failed to load ID card data")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  // Format date for validity
  const formatValidDate = () => {
    if (!profileData?.createdAt) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const createdDate = new Date(profileData.createdAt)
    // Add 1 year validity from creation date
    const validTill = new Date(createdDate)
    validTill.setFullYear(validTill.getFullYear() + 1)
    return validTill.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Get status display
  const getStatusDisplay = () => {
    if (!profileData) return "Active"
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive')
    // Capitalize first letter
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  // Get status color
  const getStatusColor = () => {
    if (!profileData) return "bg-green-500"
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive')
    if (status === 'active' || status === 'approved') return "bg-green-500"
    if (status === 'pending') return "bg-yellow-500"
    if (status === 'suspended' || status === 'blocked') return "bg-red-500"
    return "bg-gray-500"
  }

  // Get profile image URL
  const getProfileImageUrl = () => {
    if (profileData?.profileImage?.url) {
      return profileData.profileImage.url
    }
    if (profileData?.documents?.photo) {
      return profileData.documents.photo
    }
    // Fallback to avatar generator with name
    const name = profileData?.name || "Delivery Partner"
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ff8100&color=fff&size=128`
  }

  // Get vehicle display text
  const getVehicleDisplay = () => {
    if (!profileData?.vehicle) return null
    const vehicle = profileData.vehicle
    const parts = []
    if (vehicle.type) parts.push(vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1))
    if (vehicle.number) parts.push(vehicle.number)
    return parts.length > 0 ? parts.join(" - ") : null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading ID card...</p>
        </div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Failed to load ID card data</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const idCardData = {
    name: profileData.name || "Delivery Partner",
    id: profileData.deliveryId || profileData._id?.toString().slice(-8).toUpperCase() || "N/A",
    phone: profileData.phone || "N/A",
    status: getStatusDisplay(),
    statusColor: getStatusColor(),
    validTill: formatValidDate(),
    vehicle: getVehicleDisplay(),
    profileImage: getProfileImageUrl()
  }

  return (
    <div className="min-h-screen bg-gray-100 relative">
      {/* Close Button - Top Right */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-20"
      >
        <X className="w-6 h-6 text-black" />
      </button>

      {/* Top Grey Background Section */}
      <div className="bg-gray-200 h-32 relative">
        {/* Profile Picture - Positioned on gray area, overlapping into white */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
          <img
            src={idCardData.profileImage}
            alt={idCardData.name}
            className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
            onError={(e) => {
              const name = idCardData.name || "Delivery Partner"
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ff8100&color=fff&size=128`
            }}
          />
        </div>
      </div>

      {/* Main White Content Area */}
      <div className="bg-white min-h-[calc(100vh-8rem)] relative pt-16">
        {/* Content - Centered */}
        <div className="flex flex-col items-center px-4 py-4">
          {/* Brand Name */}
          <p className="text-sm text-gray-400 mb-2">{companyName.toLowerCase()}</p>

          {/* Delivery Partner Title */}
          <h1 className="text-3xl font-bold text-black mb-2">DELIVERY PARTNER</h1>

          {/* Service Type */}
          <p className="text-base text-gray-600 mb-4">Essential Services - Food Delivery</p>

          {/* Active Status Button */}
          <div className="mb-4">
            <span className={`${idCardData.statusColor} text-white px-6 py-2 rounded-lg text-sm font-medium`}>
              {idCardData.status}
            </span>
          </div>

          {/* Valid Date */}
          <p className="text-sm text-gray-600 mb-6">
            Valid on: {idCardData.validTill}
          </p>

          {/* Name */}
          <h2 className="text-2xl font-bold text-black mb-2">{idCardData.name}</h2>

          {/* ID Number */}
          <p className="text-base text-black mb-6">{idCardData.id}</p>

          {/* Phone Section */}
          <div className="w-full max-w-md mb-4 text-center">
            <p className="text-xs text-gray-500 mb-1">PHONE</p>
            <p className="text-lg font-bold text-black">{idCardData.phone}</p>
          </div>

          {/* Vehicle Section */}
          {idCardData.vehicle && (
            <div className="w-full max-w-md mb-4 text-center">
              <p className="text-xs text-gray-500 mb-1">VEHICLE</p>
              <p className="text-lg font-bold text-black">{idCardData.vehicle}</p>
            </div>
          )}

          {/* Company Name */}
          <p className="text-sm text-gray-500">{companyName} Limited</p>
        </div>
      </div>
    </div>
  )
}

