import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import {
  ArrowLeft,
  ChevronDown,
  Mail,
  CheckCircle2,
  Upload,
  ImageIcon,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { restaurantAPI } from "@/lib/api"

// Country codes
const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+7", country: "RU", flag: "🇷🇺" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
]

export default function InviteUser() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roleFromUrl = searchParams.get("role") || "staff"
  // Ensure role is not "owner" - default to "staff" if owner is provided
  const validRole = roleFromUrl === "owner" ? "staff" : (roleFromUrl === "manager" ? "manager" : "staff")
  
  const [countryCode, setCountryCode] = useState("+91")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [selectedRole, setSelectedRole] = useState(validRole)
  const [phoneError, setPhoneError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [showUserAddedDialog, setShowUserAddedDialog] = useState(false)
  const [addMethod, setAddMethod] = useState("phone") // "phone" or "email"
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

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

  // Phone number validation
  const validatePhone = (phone) => {
    if (!phone.trim()) {
      setPhoneError("Phone number is required")
      return false
    }
    // Remove any non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length < 10) {
      setPhoneError("Phone number must be at least 10 digits")
      return false
    }
    if (digitsOnly.length > 15) {
      setPhoneError("Phone number is too long")
      return false
    }
    setPhoneError("")
    return true
  }

  // Email validation
  const validateEmail = (email) => {
    if (!email.trim()) {
      setEmailError("Email is required")
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address")
      return false
    }
    setEmailError("")
    return true
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "") // Only allow digits
    setPhoneNumber(value)
    if (value) {
      validatePhone(value)
    } else {
      setPhoneError("")
    }
  }

  const handleEmailChange = (e) => {
    const value = e.target.value
    setEmail(value)
    if (value) {
      validateEmail(value)
    } else {
      setEmailError("")
    }
  }

  // Name validation
  const validateName = (name) => {
    if (!name.trim()) {
      setNameError("Name is required")
      return false
    }
    if (name.trim().length < 2) {
      setNameError("Name must be at least 2 characters")
      return false
    }
    setNameError("")
    return true
  }

  const handleNameChange = (e) => {
    const value = e.target.value
    setName(value)
    if (value) {
      validateName(value)
    } else {
      setNameError("")
    }
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhoto(file)
      // Create preview
      const reader = new FileReader()
      reader.onload = (event) => {
        setPhotoPreview(event.target?.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemovePhoto = () => {
    setPhoto(null)
    setPhotoPreview(null)
    // Reset file input
    const fileInput = document.getElementById('photoInput')
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const handleAddUser = async () => {
    // Validate name
    if (!validateName(name)) return

    // Validate phone or email based on method
    let isValid = false
    if (addMethod === "phone") {
      isValid = validatePhone(phoneNumber)
    } else {
      isValid = validateEmail(email)
    }

    if (!isValid) return

    try {
      // Prepare FormData for API (to support file upload)
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('role', selectedRole)
      if (addMethod === "phone") {
        formData.append('phone', phoneNumber)
      } else {
        formData.append('email', email.trim())
      }
      
      // Add photo if selected
      if (photo) {
        formData.append('photo', photo)
      }

      // Call backend API to add staff
      const response = await restaurantAPI.addStaff(formData)
      
      if (response?.data?.success) {
        // Dispatch event to notify ContactDetails page
        window.dispatchEvent(new Event("invitesUpdated"))
        
        // Show success dialog
        setShowUserAddedDialog(true)
      } else {
        throw new Error("Invalid response from server")
      }
    } catch (error) {
      console.error("Error adding user:", error)
      const errorMessage = error.response?.data?.message || error.message || "Failed to add user. Please try again."
      alert(errorMessage)
    }
  }

  const handleUserAddedClose = () => {
    setShowUserAddedDialog(false)
    // Navigate back after a short delay
    setTimeout(() => {
      navigate(-1)
    }, 300)
  }

  const selectedCountry = countryCodes.find(c => c.code === countryCode) || countryCodes[2]

  const isFormValid = name.trim().length >= 2 && !nameError && (
    addMethod === "phone" 
      ? phoneNumber.trim().length >= 10 && !phoneError
      : email.trim() && !emailError
  )

  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Add user</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Name Input Section */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Name *</label>
          <Input
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder="Enter full name"
            className={`w-full h-12 border-gray-200 rounded-lg ${nameError ? "border-red-500" : ""}`}
          />
          {nameError && (
            <p className="text-sm text-red-600 mt-1">{nameError}</p>
          )}
        </div>

        {/* Phone Number Input Section */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Phone number *</label>
          <div className="flex gap-2 items-stretch">
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="w-[100px] h-12! border-gray-200 rounded-lg flex items-center shrink-0">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <span className="text-base">{selectedCountry.flag}</span>
                    <span className="text-sm font-medium text-gray-900">{selectedCountry.code}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {countryCodes.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    <span className="flex items-center gap-2">
                      <span>{country.flag}</span>
                      <span>{country.code}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="tel"
              value={phoneNumber}
              onChange={handlePhoneChange}
              placeholder="Enter phone number"
              className={`flex-1 h-12 border-gray-200 rounded-lg ${phoneError ? "border-red-500" : ""}`}
              maxLength={15}
            />
          </div>
          {phoneError && (
            <p className="text-sm text-red-600 mt-1">{phoneError}</p>
          )}
          <button
            onClick={() => {
              setAddMethod("email")
              setPhoneNumber("")
              setPhoneError("")
            }}
            className="text-blue-600 text-sm font-normal hover:text-blue-700 transition-colors mt-2"
          >
            Add by email instead
          </button>
        </div>

        {/* Email Input Section (shown when add by email is clicked) */}
        {addMethod === "email" && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Email address *</label>
            <Input
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="Enter email address"
              className={`w-full h-12 border-gray-200 rounded-lg ${emailError ? "border-red-500" : ""}`}
            />
            {emailError && (
              <p className="text-sm text-red-600 mt-1">{emailError}</p>
            )}
            <button
              onClick={() => {
                setAddMethod("phone")
                setEmail("")
                setEmailError("")
              }}
              className="text-blue-600 text-sm font-normal hover:text-blue-700 transition-colors mt-2"
            >
              Add by phone instead
            </button>
          </div>
        )}

        {/* Photo Upload Section */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Photo (Optional)</label>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Staff photo preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              {photo ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{photo.name}</span>
                  <button
                    onClick={handleRemovePhoto}
                    className="text-red-600 hover:text-red-700"
                    aria-label="Remove photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="photoInput"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-300 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Photo</span>
                </label>
              )}
              <input
                id="photoInput"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
          </div>
        </div>

        {/* User Role Selection */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-0 bg-gray-100 -mx-4 px-4 py-2">
            Select user role
          </h2>
          <div className="mt-2 border-b border-gray-200">
            {["staff", "manager"].map((role, index, arr) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`w-full flex items-center justify-between py-3 text-left hover:bg-gray-50 transition-colors ${
                  index < arr.length - 1 ? "border-b border-gray-200" : ""
                }`}
              >
                <span className="text-base font-normal text-gray-900 capitalize">{role}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedRole === role
                    ? "border-blue-600 bg-blue-600"
                    : "border-gray-300"
                }`}>
                  {selectedRole === role && (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add User Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40">
        <Button
          onClick={handleAddUser}
          disabled={!isFormValid}
          className={`w-full py-3 ${
            isFormValid
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          } transition-colors`}
        >
          Add user
        </Button>
      </div>

      {/* User Added Success Dialog */}
      <Dialog open={showUserAddedDialog} onOpenChange={setShowUserAddedDialog}>
        <DialogContent className="sm:max-w-md p-4 w-[90%] gap-2 flex flex-col"> 
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 text-center">
              {selectedRole === 'manager' ? 'Manager added successfully!' : 'Staff added successfully!'}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-gray-600">
              {name} has been successfully added as {selectedRole === 'manager' ? 'manager' : 'staff'} to your outlet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={handleUserAddedClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
