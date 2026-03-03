import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, Info, Tag, Upload, Calendar, FileText, MapPin, CheckCircle2, X, Image as ImageIcon, Clock, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { adminAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

const cuisinesOptions = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Pizza",
  "Burgers",
  "Bakery",
  "Cafe",
]

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\d{10}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const FSSAI_REGEX = /^\d{14}$/
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]*$/
const FEATURED_DISH_NAME_REGEX = /^[A-Za-z ]+$/
const sanitizeDigits = (value = "") => value.replace(/\D/g, "")
const sanitizePan = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
const sanitizeFssai = (value = "") => value.replace(/\D/g, "").slice(0, 14)
const sanitizeIfsc = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
const sanitizeGst = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15)
const normalizeName = (value = "") => value.replace(/\s+/g, " ").trimStart()
const hasLetters = (value = "") => /[A-Za-z]/.test(value)
const getTodayLocalYMD = () => new Date().toISOString().split("T")[0]
const getStoredFileLabel = (value) => {
  if (!value) return ""
  if (value instanceof File) return value.name
  if (typeof value === "string") return value.split("/").pop() || "Uploaded document"
  if (value?.url) return value.url.split("/").pop() || "Uploaded document"
  return "Uploaded document"
}
const getStoredImageSrc = (value) => {
  if (!value) return ""
  if (value instanceof File) return URL.createObjectURL(value)
  if (typeof value === "string") return value
  if (value?.url) return value.url
  return ""
}

export default function AddRestaurant() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [formErrors, setFormErrors] = useState({})

  // Step 1: Basic Info
  const [step1, setStep1] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    location: {
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
    },
  })

  // Step 2: Images & Operational
  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: "09:00",
    closingTime: "22:00",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  })

  // Step 3: Documents
  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  // Step 4: Display Info
  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "25-30 mins",
    featuredDish: "",
    featuredPrice: "249",
    offer: "",
    diningSettings: {
      isEnabled: false,
      maxGuests: 6,
      diningType: "family-dining"
    }
  })

  // Authentication
  const [auth, setAuth] = useState({
    email: "",
    phone: "",
    signupMethod: "email",
  })

  const languageTabs = [
    { key: "default", label: "Default" },
    { key: "en", label: "English(EN)" },
    { key: "bn", label: "Bengali - বাংলা(BN)" },
    { key: "ar", label: "Arabic - العربية (AR)" },
    { key: "es", label: "Spanish - español(ES)" },
  ]

  // Upload handler for images
  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      console.error("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions
  const validateStep1 = () => {
    const errors = []
    if (!step1.restaurantName?.trim()) errors.push("Restaurant name is required")
    if (!step1.ownerName?.trim()) errors.push("Owner name is required")
    if (step1.ownerName?.trim() && (!NAME_REGEX.test(step1.ownerName.trim()) || !hasLetters(step1.ownerName))) {
      errors.push("Owner name must contain valid characters")
    }
    if (!step1.ownerEmail?.trim()) errors.push("Owner email is required")
    if (step1.ownerEmail?.trim() && !EMAIL_REGEX.test(step1.ownerEmail.trim())) errors.push("Please enter a valid email address")
    if (!step1.ownerPhone?.trim()) errors.push("Owner phone number is required")
    if (step1.ownerPhone?.trim() && !PHONE_REGEX.test(step1.ownerPhone.trim())) errors.push("Owner phone number must be 10 digits")
    if (!step1.primaryContactNumber?.trim()) errors.push("Primary contact number is required")
    if (step1.primaryContactNumber?.trim() && !PHONE_REGEX.test(step1.primaryContactNumber.trim())) errors.push("Primary contact number must be 10 digits")
    if (!step1.location?.area?.trim()) errors.push("Area/Sector/Locality is required")
    if (!step1.location?.city?.trim()) errors.push("City is required")
    return errors
  }

  const validateStep2 = () => {
    const errors = []
    if (!step2.menuImages || step2.menuImages.length === 0) errors.push("At least one menu image is required")
    if (!step2.profileImage) errors.push("Restaurant profile image is required")
    if (!step2.cuisines || step2.cuisines.length === 0) errors.push("Please select at least one cuisine")
    if (!step2.openingTime?.trim()) errors.push("Opening time is required")
    if (!step2.closingTime?.trim()) errors.push("Closing time is required")
    if (!step2.openDays || step2.openDays.length === 0) errors.push("Please select at least one open day")
    return errors
  }

  const validateStep3 = () => {
    const errors = []
    if (!step3.panNumber?.trim()) errors.push("PAN number is required")
    if (step3.panNumber?.trim() && !PAN_REGEX.test(step3.panNumber.trim())) errors.push("PAN number must be in valid format")
    if (!step3.nameOnPan?.trim()) errors.push("Name on PAN is required")
    if (step3.nameOnPan?.trim() && (!NAME_REGEX.test(step3.nameOnPan.trim()) || !hasLetters(step3.nameOnPan))) {
      errors.push("Name on PAN must contain characters only")
    }
    if (!step3.panImage) errors.push("PAN image is required")
    if (!step3.fssaiNumber?.trim()) errors.push("FSSAI number is required")
    if (step3.fssaiNumber?.trim() && !FSSAI_REGEX.test(step3.fssaiNumber.trim())) errors.push("FSSAI number must be 14 digits")
    if (!step3.fssaiExpiry?.trim()) errors.push("FSSAI expiry date is required")
    if (step3.fssaiExpiry?.trim() && step3.fssaiExpiry < getTodayLocalYMD()) errors.push("FSSAI expiry date cannot be in the past")
    if (!step3.fssaiImage) errors.push("FSSAI image is required")
    if (step3.gstRegistered) {
      if (!step3.gstNumber?.trim()) errors.push("GST number is required when GST registered")
      if (step3.gstNumber?.trim() && !GST_REGEX.test(step3.gstNumber.trim())) errors.push("GST number must be in valid format")
      if (!step3.gstLegalName?.trim()) errors.push("GST legal name is required when GST registered")
      if (step3.gstLegalName?.trim() && (!NAME_REGEX.test(step3.gstLegalName.trim()) || !hasLetters(step3.gstLegalName))) {
        errors.push("GST legal name must contain characters only")
      }
      if (!step3.gstAddress?.trim()) errors.push("GST registered address is required when GST registered")
      if (step3.gstAddress?.trim() && /^\d+$/.test(step3.gstAddress.trim())) {
        errors.push("GST registered address cannot contain only numbers")
      }
      if (!step3.gstImage) errors.push("GST image is required when GST registered")
    }
    if (!step3.accountNumber?.trim()) errors.push("Account number is required")
    if (step3.accountNumber?.trim() && !ACCOUNT_NUMBER_REGEX.test(step3.accountNumber.trim())) {
      errors.push("Account number must be 9 to 18 digits")
    }
    if (step3.accountNumber !== step3.confirmAccountNumber) errors.push("Account number and confirmation do not match")
    if (!step3.ifscCode?.trim()) errors.push("IFSC code is required")
    if (step3.ifscCode?.trim() && !IFSC_REGEX.test(step3.ifscCode.trim())) errors.push("IFSC code must be in valid format")
    if (!step3.accountHolderName?.trim()) errors.push("Account holder name is required")
    if (step3.accountHolderName?.trim() && (!NAME_REGEX.test(step3.accountHolderName.trim()) || !hasLetters(step3.accountHolderName))) {
      errors.push("Account holder name must contain characters only")
    }
    if (!step3.accountType?.trim()) errors.push("Account type is required")
    if (step3.accountType?.trim() && !["Saving", "Current"].includes(step3.accountType.trim())) errors.push("Account type must be either Saving or Current")
    return errors
  }

  const validateStep4 = () => {
    const errors = []
    if (!step4.estimatedDeliveryTime?.trim()) errors.push("Estimated delivery time is required")
    if (!step4.featuredDish?.trim()) errors.push("Featured dish name is required")
    if (step4.featuredDish?.trim() && !FEATURED_DISH_NAME_REGEX.test(step4.featuredDish.trim())) errors.push("Featured dish name must contain only letters")
    if (!step4.featuredPrice || !/^\d+$/.test(String(step4.featuredPrice)) || Number(step4.featuredPrice) <= 0) {
      errors.push("Featured dish price is required and must be greater than 0")
    }
    if (!step4.offer?.trim()) errors.push("Special offer/promotion is required")
    return errors
  }

  const validateAuth = () => {
    const errors = []
    if (!auth.email && !auth.phone) errors.push("Either email or phone is required")
    if (auth.email && !EMAIL_REGEX.test(auth.email.trim())) errors.push("Please enter a valid email address")
    if (auth.phone && !PHONE_REGEX.test(auth.phone.trim())) errors.push("Phone number must be 10 digits")
    return errors
  }

  const handleNext = () => {
    setFormErrors({})
    let validationErrors = []

    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    } else if (step === 4) {
      validationErrors = validateStep4()
    } else if (step === 5) {
      validationErrors = validateAuth()
    }

    if (validationErrors.length > 0) {
      validationErrors.forEach((error) => {
        toast.error(error)
      })
      return
    }

    if (step < 5) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setFormErrors({})

    try {
      // Upload all images first
      let profileImageData = null
      if (step2.profileImage instanceof File) {
        profileImageData = await handleUpload(step2.profileImage, "appzeto/restaurant/profile")
      } else if (step2.profileImage?.url) {
        profileImageData = step2.profileImage
      }

      let menuImagesData = []
      for (const file of step2.menuImages.filter(f => f instanceof File)) {
        const uploaded = await handleUpload(file, "appzeto/restaurant/menu")
        menuImagesData.push(uploaded)
      }
      const existingMenuUrls = step2.menuImages.filter(img => !(img instanceof File) && (img?.url || (typeof img === 'string' && img.startsWith('http'))))
      menuImagesData = [...existingMenuUrls, ...menuImagesData]

      let panImageData = null
      if (step3.panImage instanceof File) {
        panImageData = await handleUpload(step3.panImage, "appzeto/restaurant/pan")
      } else if (step3.panImage?.url) {
        panImageData = step3.panImage
      }

      let gstImageData = null
      if (step3.gstRegistered && step3.gstImage) {
        if (step3.gstImage instanceof File) {
          gstImageData = await handleUpload(step3.gstImage, "appzeto/restaurant/gst")
        } else if (step3.gstImage?.url) {
          gstImageData = step3.gstImage
        }
      }

      let fssaiImageData = null
      if (step3.fssaiImage instanceof File) {
        fssaiImageData = await handleUpload(step3.fssaiImage, "appzeto/restaurant/fssai")
      } else if (step3.fssaiImage?.url) {
        fssaiImageData = step3.fssaiImage
      }

      // Prepare payload
      const payload = {
        // Step 1
        restaurantName: step1.restaurantName,
        ownerName: step1.ownerName,
        ownerEmail: step1.ownerEmail,
        ownerPhone: step1.ownerPhone,
        primaryContactNumber: step1.primaryContactNumber,
        location: step1.location,
        // Step 2
        menuImages: menuImagesData,
        profileImage: profileImageData,
        cuisines: step2.cuisines,
        openingTime: step2.openingTime,
        closingTime: step2.closingTime,
        openDays: step2.openDays,
        // Step 3
        panNumber: step3.panNumber,
        nameOnPan: step3.nameOnPan,
        panImage: panImageData,
        gstRegistered: step3.gstRegistered,
        gstNumber: step3.gstNumber,
        gstLegalName: step3.gstLegalName,
        gstAddress: step3.gstAddress,
        gstImage: gstImageData,
        fssaiNumber: step3.fssaiNumber,
        fssaiExpiry: step3.fssaiExpiry,
        fssaiImage: fssaiImageData,
        accountNumber: step3.accountNumber,
        ifscCode: step3.ifscCode,
        accountHolderName: step3.accountHolderName,
        accountType: step3.accountType,
        // Step 4
        estimatedDeliveryTime: step4.estimatedDeliveryTime,
        featuredDish: step4.featuredDish,
        featuredPrice: parseFloat(step4.featuredPrice) || 249,
        offer: step4.offer,
        // Auth
        email: auth.email || null,
        phone: auth.phone || null,
        signupMethod: auth.email ? 'email' : 'phone',
        // Dining Settings
        diningSettings: step4.diningSettings,
      }

      // Call backend API
      const response = await adminAPI.createRestaurant(payload)

      if (response.data.success) {
        toast.success("Restaurant created successfully!")
        setShowSuccessDialog(true)
        setTimeout(() => {
          navigate("/admin/restaurants")
        }, 2000)
      } else {
        throw new Error(response.data.message || "Failed to create restaurant")
      }
    } catch (error) {
      console.error("Error creating restaurant:", error)
      const errorMsg = error?.response?.data?.message || error?.message || "Failed to create restaurant. Please try again."
      toast.error(errorMsg)
      setFormErrors({ submit: errorMsg })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Render functions for each step
  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-700">Restaurant name*</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Customers will see this name"
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => setStep1({ ...step1, ownerName: normalizeName(e.target.value) })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Owner full name"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Email address*</Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Phone number*</Label>
            <Input
              value={step1.ownerPhone || ""}
              onChange={(e) => setStep1({ ...step1, ownerPhone: sanitizeDigits(e.target.value).slice(0, 10) })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="10-digit mobile number"
              inputMode="numeric"
              maxLength={10}
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
        <div>
          <Label className="text-xs text-gray-700">Primary contact number*</Label>
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => setStep1({ ...step1, primaryContactNumber: sanitizeDigits(e.target.value).slice(0, 10) })}
            className="mt-1 bg-white text-sm text-black placeholder-black"
            placeholder="Restaurant's primary contact number"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <div className="space-y-3">
          <Input
            value={step1.location?.area || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, area: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Area / Sector / Locality*"
          />
          <Input
            value={step1.location?.city || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, city: e.target.value } })}
            className="bg-white text-sm"
            placeholder="City*"
          />
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine1: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Shop no. / building no. (optional)"
          />
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine2: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Floor / tower (optional)"
          />
          <Input
            value={step1.location?.state || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, state: e.target.value } })}
            className="bg-white text-sm"
            placeholder="State (optional)"
          />
          <Input
            value={step1.location?.pincode || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, pincode: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Pin code (optional)"
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, landmark: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Nearby landmark (optional)"
          />
        </div>
      </section>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images*</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3">
            <label htmlFor="menuImagesInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border-black text-xs font-medium cursor-pointer w-full items-center">
              <Upload className="w-4.5 h-4.5" />
              <span>Choose files</span>
            </label>
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length) {
                  setStep2((prev) => ({ ...prev, menuImages: [...(prev.menuImages || []), ...files] }))
                  e.target.value = ''
                }
              }}
            />
          </div>
          {step2.menuImages.length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                const imageUrl = file instanceof File ? URL.createObjectURL(file) : (file?.url || file)
                return (
                  <div key={idx} className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100">
                    {imageUrl && <img src={imageUrl} alt={`Menu ${idx + 1}`} className="w-full h-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => setStep2((prev) => ({ ...prev, menuImages: prev.menuImages.filter((_, i) => i !== idx) }))}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image*</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
              {step2.profileImage ? (
                (() => {
                  const imageSrc = step2.profileImage instanceof File ? URL.createObjectURL(step2.profileImage) : (step2.profileImage?.url || step2.profileImage)
                  return imageSrc ? <img src={imageSrc} alt="Profile" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-500" />
                })()
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <label htmlFor="profileImageInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border-black text-xs font-medium cursor-pointer">
              <Upload className="w-4.5 h-4.5" />
              <span>Upload</span>
            </label>
            <input
              id="profileImageInput"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                if (file) setStep2((prev) => ({ ...prev, profileImage: file }))
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <div>
          <Label className="text-xs text-gray-700">Select cuisines (up to 3)*</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisinesOptions.map((cuisine) => {
              const active = step2.cuisines.includes(cuisine)
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => {
                    setStep2((prev) => {
                      const exists = prev.cuisines.includes(cuisine)
                      if (exists) return { ...prev, cuisines: prev.cuisines.filter((c) => c !== cuisine) }
                      if (prev.cuisines.length >= 3) return prev
                      return { ...prev, cuisines: [...prev.cuisines, cuisine] }
                    })
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
                >
                  {cuisine}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs text-gray-700">Delivery timings*</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700 mb-1 block">Opening time</Label>
              <Input
                type="time"
                value={step2.openingTime || ""}
                onChange={(e) => setStep2({ ...step2, openingTime: e.target.value })}
                className="bg-white text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700 mb-1 block">Closing time</Label>
              <Input
                type="time"
                value={step2.closingTime || ""}
                onChange={(e) => setStep2({ ...step2, closingTime: e.target.value })}
                className="bg-white text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days*</span>
          </Label>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setStep2((prev) => {
                      const exists = prev.openDays.includes(day)
                      if (exists) return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
                      return { ...prev, openDays: [...prev.openDays, day] }
                    })
                  }}
                  className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
                >
                  {day.charAt(0)}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">PAN details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700">PAN number*</Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => setStep3({ ...step3, panNumber: sanitizePan(e.target.value) })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="ABCDE1234F"
              maxLength={10}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Name on PAN*</Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) => setStep3({ ...step3, nameOnPan: normalizeName(e.target.value) })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700">PAN image*</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setStep3({ ...step3, panImage: e.target.files?.[0] || null })}
            className="mt-1 bg-white text-sm text-black placeholder-black"
          />
          {step3.panImage && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <img src={getStoredImageSrc(step3.panImage)} alt="PAN document" className="h-full w-full object-cover" />
              </div>
              <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.panImage)}</p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">GST details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
          >
            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <Input value={step3.gstNumber || ""} onChange={(e) => setStep3({ ...step3, gstNumber: sanitizeGst(e.target.value) })} className="bg-white text-sm" placeholder="GST number*" maxLength={15} />
            <Input value={step3.gstLegalName || ""} onChange={(e) => setStep3({ ...step3, gstLegalName: normalizeName(e.target.value) })} className="bg-white text-sm" placeholder="Legal name*" />
            <Input value={step3.gstAddress || ""} onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })} className="bg-white text-sm" placeholder="Registered address*" />
            <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, gstImage: e.target.files?.[0] || null })} className="bg-white text-sm" />
            {step3.gstImage && (
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                  <img src={getStoredImageSrc(step3.gstImage)} alt="GST document" className="h-full w-full object-cover" />
                </div>
                <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.gstImage)}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input value={step3.fssaiNumber || ""} onChange={(e) => setStep3({ ...step3, fssaiNumber: sanitizeFssai(e.target.value) })} className="bg-white text-sm" placeholder="FSSAI number*" inputMode="numeric" maxLength={14} />
          <div>
            <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date*</Label>
            <Input
              type="date"
              value={step3.fssaiExpiry || ""}
              onChange={(e) => setStep3({ ...step3, fssaiExpiry: e.target.value })}
              min={getTodayLocalYMD()}
              className="bg-white text-sm"
            />
          </div>
        </div>
        <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, fssaiImage: e.target.files?.[0] || null })} className="bg-white text-sm" />
        {step3.fssaiImage && (
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
              <img src={getStoredImageSrc(step3.fssaiImage)} alt="FSSAI document" className="h-full w-full object-cover" />
            </div>
            <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.fssaiImage)}</p>
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Bank account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input value={step3.accountNumber || ""} onChange={(e) => setStep3({ ...step3, accountNumber: sanitizeDigits(e.target.value).slice(0, 18) })} className="bg-white text-sm" placeholder="Account number*" inputMode="numeric" maxLength={18} />
          <Input value={step3.confirmAccountNumber || ""} onChange={(e) => setStep3({ ...step3, confirmAccountNumber: sanitizeDigits(e.target.value).slice(0, 18) })} className="bg-white text-sm" placeholder="Re-enter account number*" inputMode="numeric" maxLength={18} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input value={step3.ifscCode || ""} onChange={(e) => setStep3({ ...step3, ifscCode: sanitizeIfsc(e.target.value) })} className="bg-white text-sm" placeholder="IFSC code*" maxLength={11} />
          <select value={step3.accountType || ""} onChange={(e) => setStep3({ ...step3, accountType: e.target.value })} className="bg-white text-sm border border-input rounded-md h-10 px-3">
            <option value="">Select account type</option>
            <option value="Saving">Saving</option>
            <option value="Current">Current</option>
          </select>
        </div>
        <Input value={step3.accountHolderName || ""} onChange={(e) => setStep3({ ...step3, accountHolderName: normalizeName(e.target.value) })} className="bg-white text-sm" placeholder="Account holder name*" />
      </section>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
        <div>
          <Label className="text-xs text-gray-700">Estimated Delivery Time*</Label>
          <Input value={step4.estimatedDeliveryTime || ""} onChange={(e) => setStep4({ ...step4, estimatedDeliveryTime: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 25-30 mins" />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Featured Dish Name*</Label>
          <Input value={step4.featuredDish || ""} onChange={(e) => setStep4({ ...step4, featuredDish: e.target.value.replace(/[^A-Za-z ]/g, "") })} className="mt-1 bg-white text-sm" placeholder="e.g., Butter Chicken Special" />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Featured Dish Price (₹)*</Label>
          <Input type="text" inputMode="numeric" value={step4.featuredPrice || ""} onChange={(e) => setStep4({ ...step4, featuredPrice: e.target.value.replace(/\D/g, "") })} className="mt-1 bg-white text-sm" placeholder="e.g., 249" />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Special Offer/Promotion*</Label>
          <Input value={step4.offer || ""} onChange={(e) => setStep4({ ...step4, offer: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., Flat 50 Rs. OFF on Order Above Rs.199" />
        </div>
      </section>

    </div>
  )

  const renderStep5 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Authentication Details</h2>
        <p className="text-sm text-gray-600">Set up login credentials for the restaurant</p>
        <div>
          <Label className="text-xs text-gray-700">Email*</Label>
          <Input
            type="email"
            value={String(auth.email || "")}
            onChange={(e) => setAuth({ ...auth, email: e.target.value || "", signupMethod: e.target.value ? 'email' : 'phone' })}
            className="mt-1 bg-white text-sm"
            placeholder="restaurant@example.com"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-700">Phone (if no email)</Label>
          <Input
            type="tel"
            value={String(auth.phone || "")}
            onChange={(e) => setAuth({ ...auth, phone: sanitizeDigits(e.target.value).slice(0, 10), signupMethod: !auth.email ? 'phone' : 'email' })}
            className="mt-1 bg-white text-sm"
            placeholder="10-digit phone number"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    if (step === 4) return renderStep4()
    return renderStep5()
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-600" />
          <div className="text-sm font-semibold text-black">Add New Restaurant</div>
        </div>
        <div className="text-xs text-gray-600">Step {step} of 5</div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {renderStep()}
      </main>

      {formErrors.submit && (
        <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">{formErrors.submit}</div>
      )}

      <footer className="px-4 sm:px-6 py-3 bg-white">
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            disabled={step === 1 || isSubmitting}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="text-sm text-gray-700 bg-transparent"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isSubmitting}
            className="text-sm bg-black text-white px-6"
          >
            {step === 5 ? (isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating... </> : "Create Restaurant") : isSubmitting ? "Saving..." : "Continue"}
          </Button>
        </div>
      </footer>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md bg-white p-0">
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-75"></div>
                <div className="relative bg-emerald-500 rounded-full p-4">
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-slate-900 mb-2">Restaurant Created Successfully!</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                The restaurant has been created and can now login with the provided credentials.
              </DialogDescription>
            </DialogHeader>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
