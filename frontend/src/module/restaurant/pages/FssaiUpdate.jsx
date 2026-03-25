import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Camera, FileText, Upload, X } from "lucide-react"

export default function FssaiUpdate() {
  const navigate = useNavigate()
  const cameraInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [formData, setFormData] = useState({
    registrationNumber: "",
    validUpto: "",
    file: null,
  })

  const selectedFileLabel = useMemo(() => {
    if (!formData.file) return ""
    return `${formData.file.name} (${Math.max(1, Math.round(formData.file.size / 1024))} KB)`
  }, [formData.file])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.file) return
    navigate(-1)
  }

  const handleFileSelection = (event) => {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) return

    const isValidType = /image\/|application\/pdf/.test(nextFile.type)
    if (!isValidType) {
      event.target.value = ""
      return
    }

    setFormData((prev) => ({
      ...prev,
      file: nextFile,
    }))
  }

  const clearSelectedFile = () => {
    setFormData((prev) => ({
      ...prev,
      file: null,
    }))

    if (cameraInputRef.current) cameraInputRef.current.value = ""
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-gray-200">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">Update FSSAI</h1>
      </div>

      <form id="fssai-update-form" onSubmit={handleSubmit} className="flex-1 px-4 pt-4 pb-28 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            FSSAI registration number
          </label>
          <input
            type="text"
            placeholder="eg. 19138110019201"
            value={formData.registrationNumber}
            onChange={(e) => setFormData((prev) => ({ ...prev, registrationNumber: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Valid up to
          </label>
          <input
            type="text"
            placeholder="DD-MM-YYYY"
            value={formData.validUpto}
            onChange={(e) => setFormData((prev) => ({ ...prev, validUpto: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Upload your FSSAI license
          </label>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelection}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileSelection}
          />

          <div className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 flex flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-full bg-white p-3 shadow-sm">
              <Upload className="w-5 h-5 text-gray-700" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              Upload your FSSAI license
            </p>
            <p className="text-xs text-gray-500">
              jpeg, png, or pdf (up to 5MB)
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-900 hover:bg-gray-100"
              >
                <Camera className="w-4 h-4" />
                Use camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-900 hover:bg-gray-100"
              >
                <FileText className="w-4 h-4" />
                Choose file
              </button>
            </div>
          </div>

          {formData.file && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900">Selected file</p>
                <p className="mt-1 text-xs text-gray-600 break-all">{selectedFileLabel}</p>
              </div>
              <button
                type="button"
                onClick={clearSelectedFile}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Remove selected file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            className="mt-2 text-xs text-gray-700 underline underline-offset-2"
          >
            View upload guidelines
          </button>
        </div>
      </form>

      <div className="px-4 pb-6 pt-2 border-t border-gray-200 bg-white">
        <button
          type="submit"
          form="fssai-update-form"
          className={`w-full py-3 rounded-full text-sm font-medium transition-colors ${
            formData.file
              ? "bg-black text-white hover:bg-gray-900"
              : "bg-gray-200 text-gray-500"
          }`}
          disabled={!formData.file}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}
