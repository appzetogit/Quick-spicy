import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import {
  ArrowLeft,
  Edit,
  User,
  Plus,
  Coffee,
  Trash2,
} from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import OptimizedImage from "@/components/OptimizedImage"
import { ImageIcon } from "lucide-react"

export default function ContactDetails() {
  const navigate = useNavigate()
  const [invitedUsers, setInvitedUsers] = useState([])
  
  // Owner data - Load from backend
  const STORAGE_KEY = "restaurant_owner_contact"
  const [ownerData, setOwnerData] = useState({
    name: "",
    phone: "",
    email: "",
    photo: null
  })
  const [loading, setLoading] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)

  // Fetch restaurant data from backend
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setOwnerData({
            name: data.ownerName || data.name || "",
            phone: data.ownerPhone || data.primaryContactNumber || data.phone || "",
            email: data.ownerEmail || data.email || "",
            photo: data.profileImage?.url || null
          })
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
        console.error("Error fetching restaurant data:", error)
        }
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem(STORAGE_KEY)
          if (saved) {
            const parsed = JSON.parse(saved)
            setOwnerData(parsed)
          }
        } catch (e) {
          console.error("Error loading owner data from localStorage:", e)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()

    // Listen for owner data updates
    const handleOwnerDataUpdate = () => {
      fetchRestaurantData()
    }

    window.addEventListener("ownerDataUpdated", handleOwnerDataUpdate)
    return () => {
      window.removeEventListener("ownerDataUpdated", handleOwnerDataUpdate)
    }
  }, [])

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])


  const handleInviteClick = (role = "") => {
    navigate(`/restaurant/invite-user?role=${role}`)
  }

  const handleEditOwner = () => {
    navigate("/restaurant/edit-owner")
  }

  // Load staff/manager from backend API
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        setLoadingStaff(true)
        const response = await restaurantAPI.getStaff()
        const staffData = response?.data?.data?.staff || response?.data?.staff || []
        
        // Transform API data to match frontend format
        const transformedStaff = staffData.map((staff) => ({
          id: staff._id || staff.id,
          name: staff.name,
          phone: staff.phone,
          email: staff.email,
          role: staff.role,
          status: staff.status,
          profileImage: staff.profileImage || null,
          addedAt: staff.addedAt
        }))
        
        setInvitedUsers(transformedStaff)
      } catch (error) {
        console.error("Error fetching staff:", error)
        setInvitedUsers([])
      } finally {
        setLoadingStaff(false)
      }
    }

    fetchStaff()

    // Listen for staff updates
    const handleStaffUpdate = () => {
      fetchStaff()
    }

    window.addEventListener("invitesUpdated", handleStaffUpdate)
    return () => {
      window.removeEventListener("invitesUpdated", handleStaffUpdate)
    }
  }, [])

  // Listen for owner data updates
  useEffect(() => {
    const handleOwnerDataUpdate = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          setOwnerData(parsed)
        }
      } catch (error) {
        console.error("Error loading updated owner data:", error)
      }
    }

    window.addEventListener("ownerDataUpdated", handleOwnerDataUpdate)
    return () => {
      window.removeEventListener("ownerDataUpdated", handleOwnerDataUpdate)
    }
  }, [])

  // Delete user
  const handleDeleteInvite = async (userId) => {
    if (window.confirm("Are you sure you want to remove this user?")) {
      try {
        const response = await restaurantAPI.deleteStaff(userId)
        
        if (response?.data?.success) {
          // Remove from local state
          setInvitedUsers(prev => prev.filter(user => user.id !== userId))
          // Dispatch event to notify other components
          window.dispatchEvent(new Event("invitesUpdated"))
        } else {
          throw new Error("Failed to delete user")
        }
      } catch (error) {
        console.error("Error deleting user:", error)
        const errorMessage = error.response?.data?.message || error.message || "Failed to remove user. Please try again."
        alert(errorMessage)
      }
    }
  }


  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant")}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Contact details</h1>
        </div>
      </div>

      {/* Content */}
      <div className=" bg-gray-100 space-y-6">
        {/* Owner Section */}
        <div>
          <h2 className="px-4 text-base font-bold text-gray-900 my-3">Owner</h2>
          <div className="bg-white rounded-0 p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              {ownerData.photo ? (
                <OptimizedImage
                  src={ownerData.photo}
                  alt="Owner profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 mb-1">
                {loading ? "Loading..." : (ownerData.name || "N/A")}
              </p>
              <p className="text-sm text-gray-900 font-normal">
                {loading ? "Loading..." : (ownerData.phone || "N/A")}
              </p>
              <p className="text-sm text-gray-900 font-normal">
                {loading ? "Loading..." : (ownerData.email || "N/A")}
              </p>
            </div>
            <button
              onClick={handleEditOwner}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              aria-label="Edit owner"
            >
              <Edit className="w-5 h-5 text-blue-600" />
            </button>
          </div>
        </div>

        {/* Manager Section */}
        <div>
          <h2 className="px-4 text-base font-bold text-gray-900 mb-3">Manager</h2>
          {invitedUsers.filter(invite => invite.role === "manager").length === 0 ? (
            <div className="bg-white rounded-0 p-4">
              <p className="text-sm text-gray-900 font-normal">
                No one added as manager yet.{" "}
                <button
                  onClick={() => handleInviteClick("manager")}
                  className="text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Add someone
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {loadingStaff ? (
                <div className="bg-white rounded-0 p-4">
                  <p className="text-sm text-gray-500">Loading...</p>
                </div>
              ) : (
                invitedUsers
                  .filter(user => user.role === "manager")
                  .map((user) => {
                    return (
                    <div key={user.id} className="bg-white rounded-0 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-orange-100 border border-orange-300 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                          {user.profileImage?.url ? (
                            <img
                              src={user.profileImage.url}
                              alt={user.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Coffee className="w-6 h-6 text-orange-700" />
                          )}
                        </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 -mb-5">
                              <button
                                onClick={() => handleDeleteInvite(user.id)}
                                className="text-red-600 text-xs font-normal hover:text-red-700 transition-colors ml-auto"
                                aria-label="Delete user"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                            <p className="text-base font-bold text-gray-900 mb-0.5 ">
                              {user.name || "N/A"}
                            </p>
                            <p className="text-sm text-gray-900 font-normal">
                              {user.phone || user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          )}
        </div>

        {/* Staff Section */}
        <div>
          <h2 className="px-4 text-base font-bold text-gray-900 mb-3">Staff</h2>
          {invitedUsers.filter(invite => invite.role === "staff").length === 0 ? (
            <div className="bg-white rounded-0 p-4">
              <p className="text-sm text-gray-900 font-normal">
                No one added as staff yet.{" "}
                <button
                  onClick={() => handleInviteClick("staff")}
                  className="text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Add someone
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {loadingStaff ? (
                <div className="bg-white rounded-0 p-4">
                  <p className="text-sm text-gray-500">Loading...</p>
                </div>
              ) : (
                invitedUsers
                  .filter(user => user.role === "staff")
                  .map((user) => {
                    return (
                    <div key={user.id} className="bg-white rounded-0 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-orange-100 border border-orange-300 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                          {user.profileImage?.url ? (
                            <img
                              src={user.profileImage.url}
                              alt={user.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Coffee className="w-6 h-6 text-orange-700" />
                          )}
                        </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 -mb-5">
                              <button
                                onClick={() => handleDeleteInvite(user.id)}
                                className="text-red-600 text-xs font-normal hover:text-red-700 transition-colors ml-auto"
                                aria-label="Delete user"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                            <p className="text-base font-bold text-gray-900 mb-0.5">
                              {user.name || "N/A"}
                            </p>
                            <p className="text-sm text-gray-900 font-normal">
                              {user.phone || user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => handleInviteClick("")}
        className="fixed bottom-6 right-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold shadow-lg flex items-center gap-2 transition-colors z-40"
      >
        <Plus className="w-5 h-5" />
        <span>Add user</span>
      </motion.button>

    </div>
  )
}
