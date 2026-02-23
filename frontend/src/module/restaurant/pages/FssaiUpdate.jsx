import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

export default function FssaiUpdate() {
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    // For now just go back
    navigate(-1)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
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

      <form onSubmit={handleSubmit} className="flex-1 px-4 pt-4 pb-28 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            FSSAI registration number
          </label>
          <input
            type="text"
            placeholder="eg. 19138110019201"
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
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Upload your FSSAI license
          </label>
          <div className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 flex flex-col items-center justify-center text-center">
            <div className="mb-2 text-2xl">⬆️</div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              Upload your FSSAI license
            </p>
            <p className="text-xs text-gray-500">
              jpeg, png, or pdf (up to 5MB)
            </p>
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-gray-700 underline underline-offset-2"
          >
            View upload guidelines
          </button>
        </div>
      </form>

      {/* Bottom button */}
      <div className="px-4 pb-6 pt-2 border-t border-gray-200 bg-white">
        <button
          type="submit"
          form=""
          className="w-full py-3 rounded-full bg-gray-200 text-gray-500 text-sm font-medium"
          disabled
        >
          Confirm
        </button>
      </div>
    </div>
  )
}
