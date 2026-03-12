import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check } from "lucide-react"
import { deliveryAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function SignupStep2() {
  const navigate = useNavigate()
  const isMobileDevice =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "")
  const fileInputRefs = useRef({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [documents, setDocuments] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [uploadedDocs, setUploadedDocs] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDocs")
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        debugError("Error parsing saved docs:", e)
      }
    }
    return {
      profilePhoto: null,
      aadharPhoto: null,
      panPhoto: null,
      drivingLicensePhoto: null
    }
  })
  const [uploading, setUploading] = useState({
    profilePhoto: false,
    aadharPhoto: false,
    panPhoto: false,
    drivingLicensePhoto: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sourcePicker, setSourcePicker] = useState({
    isOpen: false,
    title: "",
    onSelectFile: null,
    fileNamePrefix: "delivery-document",
    fallbackInputRef: null
  })

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  // Save uploaded docs to session storage whenever they change
  useEffect(() => {
    sessionStorage.setItem("deliverySignupDocs", JSON.stringify(uploadedDocs))
  }, [uploadedDocs])

  useEffect(() => {
    return () => {
      Object.values(documents).forEach((file) => {
        if (file instanceof File) {
          const previewUrl = file.previewUrl || file._previewUrl
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl)
          }
        }
      })
    }
  }, [documents])

  const getPreviewSrc = (docType) => {
    const localFile = documents[docType]
    if (localFile instanceof File) {
      if (!localFile._previewUrl) {
        localFile._previewUrl = URL.createObjectURL(localFile)
      }
      return localFile._previewUrl
    }

    const uploaded = uploadedDocs[docType]
    if (typeof uploaded === "string") return uploaded
    return uploaded?.url || null
  }

  const getExtensionFromMimeType = (mimeType) => {
    const normalized = String(mimeType || "").toLowerCase()
    if (normalized.includes("png")) return "png"
    if (normalized.includes("webp")) return "webp"
    if (normalized.includes("heic")) return "heic"
    if (normalized.includes("heif")) return "heif"
    return "jpg"
  }

  const convertBase64ToFile = (base64Value, mimeType = "image/jpeg", fileNamePrefix = "delivery-document") => {
    if (!base64Value || typeof base64Value !== "string") {
      throw new Error("Invalid base64 image data")
    }

    let pureBase64 = base64Value
    if (base64Value.includes(",")) {
      pureBase64 = base64Value.split(",")[1]
    }

    const byteCharacters = atob(pureBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    const normalizedMimeType = mimeType || "image/jpeg"
    const extension = getExtensionFromMimeType(normalizedMimeType)
    const fileName = `${fileNamePrefix}-${Date.now()}.${extension}`
    const blob = new Blob([byteArray], { type: normalizedMimeType })
    return new File([blob], fileName, { type: normalizedMimeType })
  }

  const openBrowserCameraFallback = ({ onSelectFile }) => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = "image/*"
      input.capture = "environment"
      input.onchange = (event) => {
        const file = event?.target?.files?.[0] || null
        if (file) onSelectFile(file)
      }
      input.click()
    } catch (error) {
      debugError("Browser camera fallback failed:", error)
    }
  }

  const openBrowserFileFallback = ({ onSelectFile }) => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
      input.multiple = false
      input.onchange = (event) => {
        const file = event?.target?.files?.[0] || null
        if (file) onSelectFile(file)
      }
      input.click()
    } catch (error) {
      debugError("Browser file fallback failed:", error)
      toast.error("Could not open device files. Please try again.")
    }
  }

  const openCameraFromFlutter = async ({ onSelectFile, fileNamePrefix }) => {
    try {
      const hasBridge =
        typeof window !== "undefined" &&
        window.flutter_inappwebview &&
        typeof window.flutter_inappwebview.callHandler === "function"

      if (!hasBridge) {
        openBrowserCameraFallback({ onSelectFile })
        return
      }

      const result = await window.flutter_inappwebview.callHandler("openCamera", {
        source: "camera",
        accept: "image/*",
        multiple: false,
        quality: 0.8
      })

      if (!result || !result.success) return

      let selectedFile = null
      if (result.file instanceof File || result.file instanceof Blob) {
        selectedFile = result.file
      } else if (result.base64) {
        selectedFile = convertBase64ToFile(
          result.base64,
          result.mimeType || "image/jpeg",
          fileNamePrefix || "delivery-document"
        )
      }

      if (!selectedFile || !String(selectedFile.type || "").startsWith("image/")) {
        toast.error("Failed to capture image from camera")
        return
      }

      onSelectFile(selectedFile)
    } catch (error) {
      debugError("openCamera bridge failed:", error)
      openBrowserCameraFallback({ onSelectFile })
    }
  }

  const openImageSourcePicker = ({ title, onSelectFile, fileNamePrefix, fallbackInputRef }) => {
    setSourcePicker({
      isOpen: true,
      title: title || "Select image source",
      onSelectFile,
      fileNamePrefix: fileNamePrefix || "delivery-document",
      fallbackInputRef: fallbackInputRef || null
    })
  }

  const closeImageSourcePicker = () => {
    setSourcePicker((prev) => ({ ...prev, isOpen: false }))
  }

  const handleOpenUploadOptions = ({ title, docType, onSelectFile }) => {
    if (isMobileDevice) {
      openImageSourcePicker({
        title,
        fileNamePrefix: docType,
        fallbackInputRef: {
          current: fileInputRefs.current[docType]
        },
        onSelectFile
      })
      return
    }

    openBrowserFileFallback({ onSelectFile })
  }

  const handlePickFromDevice = () => {
    const input = sourcePicker.fallbackInputRef?.current || null

    try {
      if (input && typeof input.showPicker === "function") {
        input.showPicker()
      } else if (input) {
        input.click()
      } else {
        openBrowserFileFallback({ onSelectFile: sourcePicker.onSelectFile })
      }
      closeImageSourcePicker()
    } catch (error) {
      debugError("Device file picker open failed:", error)
      try {
        if (input) {
          input.click()
        } else {
          openBrowserFileFallback({ onSelectFile: sourcePicker.onSelectFile })
        }
        closeImageSourcePicker()
      } catch (fallbackError) {
        debugError("Fallback file input click failed:", fallbackError)
        openBrowserFileFallback({ onSelectFile: sourcePicker.onSelectFile })
        closeImageSourcePicker()
      }
    }
  }

  const handlePickFromCamera = async () => {
    const pickerConfig = {
      onSelectFile: sourcePicker.onSelectFile,
      fileNamePrefix: sourcePicker.fileNamePrefix
    }
    closeImageSourcePicker()
    await openCameraFromFlutter(pickerConfig)
  }

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB")
      return
    }

    setUploading(prev => ({ ...prev, [docType]: true }))

    try {
      const response = await uploadAPI.uploadMedia(file, {
        folder: 'appzeto/delivery/documents'
      })

      if (response?.data?.success && response?.data?.data) {
        const { url, publicId } = response.data.data

        setDocuments(prev => ({
          ...prev,
          [docType]: file
        }))

        setUploadedDocs(prev => ({
          ...prev,
          [docType]: { url, publicId }
        }))

        toast.success(`${docType.replace(/([A-Z])/g, ' $1').trim()} uploaded successfully`)
      } else {
        toast.error("Upload failed. Please try again.")
      }
    } catch (error) {
      debugError(`Error uploading ${docType}:`, error)
      toast.error(
        error?.response?.data?.message ||
        `Failed to upload ${docType.replace(/([A-Z])/g, ' $1').trim()}`
      )
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }))
    }
  }

  const handleRemove = (docType) => {
    setDocuments(prev => ({
      ...prev,
      [docType]: null
    }))
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Check if all required documents are uploaded
    if (!uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto) {
      toast.error("Please upload all required documents")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await deliveryAPI.submitSignupDocuments({
        profilePhoto: uploadedDocs.profilePhoto,
        aadharPhoto: uploadedDocs.aadharPhoto,
        panPhoto: uploadedDocs.panPhoto,
        drivingLicensePhoto: uploadedDocs.drivingLicensePhoto
      })

      if (response?.data?.success) {
        toast.success("Signup completed successfully!")
        // Redirect to delivery home page
        setTimeout(() => {
          navigate("/delivery", { replace: true })
        }, 1000)
      }
    } catch (error) {
      debugError("Error submitting documents:", error)
      const message = error?.response?.data?.message || "Failed to submit documents. Please try again."
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const uploaded = uploadedDocs[docType]
    const isUploading = uploading[docType]

    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {uploaded ? (
          <div className="relative">
            <img
              src={getPreviewSrc(docType)}
              alt={label}
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => handleRemove(docType)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
              <Check className="w-4 h-4" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 transition-colors px-4">
            <div className="flex flex-col items-center justify-center pt-5 pb-3">
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                  <p className="text-sm text-gray-500">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-1">Upload document</p>
                  <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                </>
              )}
            </div>

            {!isUploading && (
              <div className="w-full flex items-center gap-2 pb-4">
                <button
                  type="button"
                  onClick={() =>
                    handleOpenUploadOptions({
                      title: label,
                      docType,
                      onSelectFile: (selectedFile) => handleFileSelect(docType, selectedFile)
                    })
                  }
                  className="w-full text-center px-3 py-2 rounded-md bg-[#00B761] text-white text-sm font-medium cursor-pointer hover:bg-[#00A055] transition-colors"
                >
                  Upload
                </button>
              </div>
            )}

            <input
              ref={(node) => {
                fileInputRefs.current[docType] = node
              }}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
              onClick={(e) => {
                e.target.value = ""
              }}
              onChange={(e) => {
                const selectedFile = e.target.files[0]
                if (selectedFile) {
                  handleFileSelect(docType, selectedFile)
                }
                e.target.value = ""
              }}
              disabled={isUploading}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
          <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
          <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo" required={true} />
          <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />
          <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo" required={true} />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isSubmitting ? "Submitting..." : "Complete Signup"}
          </button>
        </form>
      </div>

      {sourcePicker.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-black">{sourcePicker.title || "Select image source"}</h3>
            {isMobileDevice && (
              <button
                type="button"
                className="w-full py-2.5 rounded-md bg-[#00B761] text-white text-sm font-medium hover:bg-[#00A055] transition-colors"
                onClick={handlePickFromCamera}
              >
                Use Camera
              </button>
            )}
            <button
              type="button"
              className="w-full py-2.5 rounded-md border border-gray-300 text-gray-800 text-sm font-medium hover:bg-gray-50 transition-colors"
              onClick={handlePickFromDevice}
            >
              Upload from Device
            </button>
            <button
              type="button"
              className="w-full py-2.5 rounded-md text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              onClick={closeImageSourcePicker}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

