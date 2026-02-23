import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { publicAPI } from "@/lib/api"

export default function TermsAndConditions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState("")
  const [lastUpdated, setLastUpdated] = useState("")

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await publicAPI.getTerms()
        if (response.data.success) {
          setContent(response.data.data.content)
          setLastUpdated(response.data.data.updatedAt)
        }
      } catch (error) {
        console.error("Error fetching terms:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTerms()
  }, [])

  const formatDate = (dateString) => {
    if (!dateString) return "January 1, 2024"
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] overflow-x-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 py-4 md:py-3 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Terms and Conditions</h1>
      </div>

      {/* Main Content */}
      <div className="w-full px-5 py-6 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#E23744] animate-spin mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Loading terms...</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div
                className="prose prose-sm sm:prose prose-orange dark:prose-invert max-w-none 
                  text-gray-700 dark:text-gray-300 leading-relaxed
                  [&>p]:mb-4 [&>h1]:text-xl [&>h1]:font-bold [&>h1]:mt-6 [&>h1]:mb-3
                  [&>h2]:text-lg [&>h2]:font-bold [&>h2]:mt-5 [&>h2]:mb-2
                  [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 [&>li]:mb-1"
                dangerouslySetInnerHTML={{ __html: content }}
              />

              {!content ? (
                <div className="text-center py-10">
                  <p className="text-gray-500">No terms and conditions found.</p>
                </div>
              ) : (
                <div className="mt-12 pt-6 border-t border-gray-100 dark:border-zinc-800">
                  <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm italic">
                    Last updated: {formatDate(lastUpdated)}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
