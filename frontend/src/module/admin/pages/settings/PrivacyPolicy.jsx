import { useState, useEffect } from "react"
import { toast } from "sonner"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { Textarea } from "@/components/ui/textarea"

export default function PrivacyPolicy() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [privacyData, setPrivacyData] = useState({
    title: 'Privacy Policy',
    content: ''
  })

  useEffect(() => {
    fetchPrivacyData()
  }, [])

  // Convert HTML to plain text
  const htmlToText = (html) => {
    if (!html) return ''
    
    let text = html
    
    // Replace paragraph breaks with newlines
    text = text.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n')
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '\n')
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]*>/g, '')
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
    text = text.replace(/&amp;/g, '&')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&#39;/g, "'")
    text = text.replace(/&apos;/g, "'")
    
    // Clean up multiple newlines (keep max 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n')
    
    // Trim each line and remove empty lines at start/end
    text = text.split('\n').map(line => line.trim()).join('\n')
    
    return text.trim()
  }

  const fetchPrivacyData = async () => {
    try {
      setLoading(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.PRIVACY)
      if (response.data.success) {
        // Convert HTML to plain text for textarea
        const content = response.data.data.content || ''
        const textContent = htmlToText(content)
        setPrivacyData({
          ...response.data.data,
          content: textContent
        })
      }
    } catch (error) {
      console.error('Error fetching privacy data:', error)
      toast.error('Failed to load privacy policy')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      // Convert plain text to HTML for storage
      const htmlContent = privacyData.content.split('\n').map(line => {
        if (line.trim() === '') return '<p><br></p>'
        return `<p>${line}</p>`
      }).join('')
      
      const response = await api.put(API_ENDPOINTS.ADMIN.PRIVACY, {
        title: privacyData.title,
        content: htmlContent
      })
      if (response.data.success) {
        toast.success('Privacy policy updated successfully')
        // Convert HTML to plain text for display in textarea
        const content = response.data.data.content || ''
        const textContent = htmlToText(content)
        setPrivacyData({
          ...response.data.data,
          content: textContent
        })
      }
    } catch (error) {
      console.error('Error saving privacy policy:', error)
      toast.error(error.response?.data?.message || 'Failed to save privacy policy')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-slate-600 mt-1">Manage your Privacy Policy content</p>
        </div>

        {/* Text Area */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <Textarea
            value={privacyData.content}
            onChange={(e) => setPrivacyData(prev => ({ ...prev, content: e.target.value }))}
            placeholder="Enter privacy policy content..."
            className="min-h-[600px] w-full text-sm text-slate-700 leading-relaxed resize-y"
            dir="ltr"
            style={{
              direction: 'ltr',
              textAlign: 'left',
              unicodeBidi: 'bidi-override',
              width: '100%',
              maxWidth: '100%'
            }}
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
