import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Download, ChevronDown, ChevronLeft, ChevronRight, Info, MapPin, SlidersHorizontal, ArrowDownUp, Timer, Star, IndianRupee, UtensilsCrossed, BadgePercent, ShieldCheck, X, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
const debugLog = () => {}
const debugWarn = () => {}
const debugError = () => {}
const CATEGORY_IMAGE_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><rect width='128' height='128' rx='24' fill='%23e2e8f0'/><text x='64' y='72' text-anchor='middle' font-family='Arial, sans-serif' font-size='18' fill='%2364758b'>No Image</text></svg>"

const toArray = (value) => (Array.isArray(value) ? value : [])
const normalizeCategoryName = (value) => String(value || "").trim()
const buildRestaurantCategories = (menuEntries = []) => {
  const categoryMap = new Map()

  menuEntries.forEach(({ restaurant, menu }) => {
    const restaurantId = String(restaurant?._id || restaurant?.id || "")
    const restaurantName = String(restaurant?.name || "Unknown Restaurant").trim() || "Unknown Restaurant"
    const sections = toArray(menu?.sections)

    sections.forEach((section) => {
      const rawName = normalizeCategoryName(section?.name)
      if (!rawName) return

      const key = rawName.toLowerCase()
      const directImage = toArray(section?.items).find((item) => item?.image)?.image
      const nestedImage = toArray(section?.subsections)
        .flatMap((subsection) => toArray(subsection?.items))
        .find((item) => item?.image)?.image
      const image = directImage || nestedImage || CATEGORY_IMAGE_FALLBACK

      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          id: key,
          name: rawName,
          image,
          type: "Menu Section",
          status: true,
          restaurantIds: new Set(),
          restaurantNames: [],
        })
      }

      const existing = categoryMap.get(key)
      existing.restaurantIds.add(restaurantId || restaurantName)
      if (!existing.restaurantNames.includes(restaurantName)) {
        existing.restaurantNames.push(restaurantName)
      }
      if (
        (!existing.image || existing.image === CATEGORY_IMAGE_FALLBACK) &&
        image &&
        image !== CATEGORY_IMAGE_FALLBACK
      ) {
        existing.image = image
      }
    })
  })

  return Array.from(categoryMap.values())
    .map((category, index) => ({
      ...category,
      sl: index + 1,
      restaurantCount: category.restaurantIds.size,
      restaurantsLabel: category.restaurantNames.join(", "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((category, index) => ({
      ...category,
      sl: index + 1,
    }))
}

export default function Category() {
  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [activeScrollSection, setActiveScrollSection] = useState('sort')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState({
    name: "",
    image: CATEGORY_IMAGE_FALLBACK,
    status: true,
    type: ""
  })
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [updatingHomeVisibility, setUpdatingHomeVisibility] = useState({})
  const fileInputRef = useRef(null)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  // Simple filter toggle function
  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  // Scroll tracking effect for filter modal
  useEffect(() => {
    if (!isFilterOpen || !rightContentRef.current) return

    const observerOptions = {
      root: rightContentRef.current,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-section-id')
          if (sectionId) {
            setActiveScrollSection(sectionId)
            setActiveFilterTab(sectionId)
          }
        }
      })
    }, observerOptions)

    Object.values(filterSectionRefs.current).forEach(ref => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [isFilterOpen])

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true)
      const [restaurantsResponse, adminCategoriesResponse] = await Promise.all([
        adminAPI.getRestaurants({ limit: 1000 }),
        adminAPI.getCategories({ limit: 1000 }),
      ])
      const restaurants =
        restaurantsResponse?.data?.data?.restaurants ||
        restaurantsResponse?.data?.restaurants ||
        []
      const adminCategories =
        adminCategoriesResponse?.data?.data?.categories ||
        adminCategoriesResponse?.data?.categories ||
        []

      if (!Array.isArray(restaurants) || restaurants.length === 0) {
        setCategories([])
        return
      }

      const menuEntries = await Promise.all(
        restaurants.map(async (restaurant) => {
          try {
            const restaurantId = restaurant?._id || restaurant?.id
            if (!restaurantId) return null
            const menuResponse = await adminAPI.getRestaurantMenuById(restaurantId, { noCache: true })
            const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu || { sections: [] }
            return { restaurant, menu }
          } catch (menuError) {
            debugWarn(`Failed to fetch menu for restaurant ${restaurant?._id || restaurant?.id}`, menuError)
            return null
          }
        })
      )

      const adminCategoryMap = new Map(
        (Array.isArray(adminCategories) ? adminCategories : []).map((category) => [
          String(category?.name || "").trim().toLowerCase(),
          category,
        ])
      )

      setCategories(
        buildRestaurantCategories(menuEntries.filter(Boolean)).map((category) => {
          const adminCategory = adminCategoryMap.get(String(category?.name || "").trim().toLowerCase())
          return {
            ...category,
            adminCategoryId: adminCategory?.id || adminCategory?._id || null,
            showOnHome: adminCategory?.showOnHome !== false,
          }
        })
      )
    } catch (error) {
      // More detailed error logging
      debugError('Error fetching categories:', error)
      debugError('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : null,
        request: error.request ? {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        } : null
      })
      
      if (error.response) {
        // Server responded with error status
        const status = error.response.status
        const errorData = error.response.data
        
        if (status === 401) {
          toast.error('Authentication required. Please login again.')
        } else if (status === 403) {
          toast.error('Access denied. You do not have permission.')
        } else if (status === 404) {
          toast.error('Categories endpoint not found. Please check backend server.')
        } else if (status >= 500) {
          toast.error('Server error. Please try again later.')
        } else {
          toast.error(errorData?.message || `Error ${status}: Failed to load categories`)
        }
      } else if (error.request) {
        // Request was made but no response received
        debugError('Network error - No response from server')
        debugError('Request URL:', error.config?.baseURL + error.config?.url)
        toast.error('Cannot connect to server. Please check if backend is running on ' + API_BASE_URL.replace('/api', ''))
      } else {
        // Something else happened
        debugError('Request setup error:', error.message)
        toast.error(error.message || 'Failed to load categories')
      }
      
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch categories from API
  useEffect(() => {
    const adminToken = localStorage.getItem('admin_accessToken')
    if (!adminToken) {
      debugWarn('No admin token found. User may need to login.')
      toast.error('Please login to access categories')
      setLoading(false)
      return
    }

    debugLog('API Base URL:', API_BASE_URL)
    debugLog('Admin Token:', adminToken ? 'Present' : 'Missing')

    fetchCategories()
  }, [fetchCategories])

  const filteredCategories = useMemo(() => {
    let result = [...categories]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(cat =>
        cat.name?.toLowerCase().includes(query) ||
        cat.id?.toString().includes(query) ||
        cat.restaurantsLabel?.toLowerCase().includes(query)
      )
    }

    return result
  }, [categories, searchQuery])

  const handleToggleHomeVisibility = async (category) => {
    const categoryKey = String(category?.id || category?.name || "")
    if (!categoryKey) return

    const nextShowOnHome = !(category?.showOnHome !== false)
    setUpdatingHomeVisibility((prev) => ({ ...prev, [categoryKey]: true }))

    try {
      const response = await adminAPI.updateCategoryHomeVisibility({
        name: category.name,
        image: category.image,
        type: category.type,
        showOnHome: nextShowOnHome,
      })

      const savedCategory = response?.data?.data?.category
      setCategories((prev) =>
        prev.map((item) =>
          item.id === category.id
            ? {
                ...item,
                adminCategoryId: savedCategory?.id || item.adminCategoryId,
                showOnHome: nextShowOnHome,
              }
            : item
        )
      )
      toast.success(`Category will ${nextShowOnHome ? "show" : "hide"} on home`)
    } catch (error) {
      debugError("Error updating category home visibility:", error)
      toast.error(error.response?.data?.message || "Failed to update category visibility")
    } finally {
      setUpdatingHomeVisibility((prev) => ({ ...prev, [categoryKey]: false }))
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize))
  const paginatedCategories = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages)
    const startIndex = (safePage - 1) * pageSize
    return filteredCategories.slice(startIndex, startIndex + pageSize)
  }, [filteredCategories, currentPage, pageSize, totalPages])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const _handleToggleStatus = async (id) => {
    try {
      const response = await adminAPI.toggleCategoryStatus(id)
      if (response.data.success) {
        toast.success('Category status updated successfully')
        // Update local state immediately for better UX
        setCategories(prevCategories =>
          prevCategories.map(cat =>
            cat.id === id ? { ...cat, status: !cat.status } : cat
          )
        )
        // Refresh from server to ensure consistency
        setTimeout(() => fetchCategories(), 500)
      }
    } catch (error) {
      debugError('Error toggling status:', error)
      const errorMessage = error.response?.data?.message || 'Failed to update category status'
      toast.error(errorMessage)
    }
  }


  const _handleDelete = async (id) => {
    const categoryName = categories.find(cat => cat.id === id)?.name || 'this category'
    if (window.confirm(`Are you sure you want to delete "${categoryName}"? This action cannot be undone.`)) {
      try {
        const response = await adminAPI.deleteCategory(id)
        if (response.data.success) {
          toast.success('Category deleted successfully')
          // Remove from local state immediately for better UX
          setCategories(prevCategories => prevCategories.filter(cat => cat.id !== id))
          // Refresh from server to ensure consistency
          setTimeout(() => fetchCategories(), 500)
        }
      } catch (error) {
        debugError('Error deleting category:', error)
        const errorMessage = error.response?.data?.message || 'Failed to delete category'
        toast.error(errorMessage)
      }
    }
  }

  const _handleEdit = (category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name || "",
      image: category.image || CATEGORY_IMAGE_FALLBACK,
      status: category.status !== undefined ? category.status : true,
      type: category.type || ""
    })
    setSelectedImageFile(null)
    setImagePreview(category.image || null)
    setIsModalOpen(true)
  }

  const _handleAddNew = () => {
    setEditingCategory(null)
    setFormData({
      name: "",
      image: CATEGORY_IMAGE_FALLBACK,
      status: true,
      type: ""
    })
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    setIsModalOpen(true)
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      
      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Category List', 14, 20)
      
      // Add date
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      doc.text(`Generated on: ${date}`, 14, 28)
      
      // Prepare table data
      const tableData = filteredCategories.map((category, index) => [
        category.sl || index + 1,
        category.name || 'N/A',
        category.type || 'N/A',
        category.restaurantCount || 0,
        category.showOnHome !== false ? 'Yes' : 'No',
        category.restaurantsLabel || 'N/A'
      ])
      
      // Add table
      autoTable(doc, {
        startY: 35,
        head: [['SL', 'Category Name', 'Source', 'Restaurants', 'Show On Home', 'Restaurant Names']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [59, 130, 246], // Blue color
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 30, 30]
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        styles: {
          cellPadding: 5,
          lineColor: [200, 200, 200],
          lineWidth: 0.5
        },
        columnStyles: {
          0: { cellWidth: 20 }, // SL
          1: { cellWidth: 70 }, // Category Name
          2: { cellWidth: 40 }, // Source
          3: { cellWidth: 25 }, // Restaurants
          4: { cellWidth: 25 }, // Show On Home
          5: { cellWidth: 70 }  // Restaurant Names
        }
      })
      
      // Add footer
      const pageCount = doc.internal.pages.length - 1
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )
      }
      
      // Save PDF
      const fileName = `Categories_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      
      toast.success('PDF exported successfully!')
    } catch (error) {
      debugError('Error exporting PDF:', error)
      toast.error('Failed to export PDF')
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    // Set file and create preview
    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setSelectedImageFile(null)
    setImagePreview(null)
    setFormData({
      name: "",
      image: CATEGORY_IMAGE_FALLBACK,
      status: true,
      type: ""
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setUploadingImage(true)

      // Prepare FormData for file upload
      const formDataToSend = new FormData()
      formDataToSend.append('name', formData.name)
      formDataToSend.append('type', formData.type)
      formDataToSend.append('status', formData.status.toString())

      // Add image file if selected, otherwise use existing image URL
      if (selectedImageFile) {
        formDataToSend.append('image', selectedImageFile)
      } else if (formData.image && formData.image !== CATEGORY_IMAGE_FALLBACK) {
        // If no new file but existing image URL, send it as string
        formDataToSend.append('image', formData.image)
      }

      debugLog('Sending category data:', {
        name: formData.name,
        type: formData.type,
        status: formData.status,
        hasImageFile: !!selectedImageFile,
        imageUrl: formData.image
      })

      if (editingCategory) {
        const response = await adminAPI.updateCategory(editingCategory.id, formDataToSend)
        debugLog('Category update response:', response.data)
        if (response.data.success) {
          toast.success('Category updated successfully')
          // Update local state immediately for better UX
          const updatedCategory = response.data.data.category
          setCategories(prevCategories =>
            prevCategories.map(cat =>
              cat.id === editingCategory.id
                ? { ...cat, ...updatedCategory, id: updatedCategory.id || cat.id }
                : cat
            )
          )
        }
      } else {
        const response = await adminAPI.createCategory(formDataToSend)
        debugLog('Category create response:', response.data)
        if (response.data.success) {
          toast.success('Category created successfully')
        }
      }
      
      // Close modal and reset form
      handleCloseModal()
      
      // Refresh from server to ensure consistency
      setTimeout(() => fetchCategories(), 500)
    } catch (error) {
      debugError('Error saving category:', error)
      debugError('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : null,
        request: error.request ? {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        } : null
      })
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        toast.error('Cannot connect to server. Please check if backend is running on ' + API_BASE_URL.replace('/api', ''))
      } else if (error.response) {
        toast.error(error.response.data?.message || `Error ${error.response.status}: Failed to save category`)
      } else {
        toast.error(error.message || 'Failed to save category')
      }
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Category</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Category List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredCategories.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Categories"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            <button 
              onClick={handleExportPDF}
              disabled={filteredCategories.length === 0}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            <div className="px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-100 text-slate-600">
              Showing categories from all restaurant menus
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-6">
        <div className="flex flex-col gap-1.5">
          {/* Row 1 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setIsFilterOpen(true)}
              className="h-5 px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 transition-all bg-white border border-gray-200 hover:bg-gray-50"
            >
              <SlidersHorizontal className="h-2.5 w-2.5" />
              <span className="text-[10px] font-bold text-black">Filters</span>
            </Button>
            {[
              { id: 'delivery-under-30', label: 'Under 30 mins' },
              { id: 'delivery-under-45', label: 'Under 45 mins' },
            ].map((filter) => {
              const isActive = activeFilters.has(filter.id)
              return (
                <Button
                  key={filter.id}
                  variant="outline"
                  onClick={() => toggleFilter(filter.id)}
                  className={`h-5 px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 transition-all ${
                    isActive
                      ? 'bg-green-600 text-white border border-green-600 hover:bg-green-600/90'
                      : 'bg-white border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-black'}`}>{filter.label}</span>
                </Button>
              )
            })}
          </div>
          
          {/* Row 2 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
              { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
            ].map((filter) => {
              const Icon = filter.icon
              const isActive = activeFilters.has(filter.id)
              return (
                <Button
                  key={filter.id}
                  variant="outline"
                  onClick={() => toggleFilter(filter.id)}
                  className={`h-5 px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 transition-all ${
                    isActive
                      ? 'bg-green-600 text-white border border-green-600 hover:bg-green-600/90'
                      : 'bg-white border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {Icon && <Icon className={`h-2.5 w-2.5 ${isActive ? 'text-white' : 'text-gray-900'}`} />}
                  <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-black'}`}>{filter.label}</span>
                </Button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  SL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Restaurants
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Show On Home
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Restaurant Names
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading categories...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No categories match your search</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((category, index) => (
                  <tr
                    key={category.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{((currentPage - 1) * pageSize) + index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={category.image}
                          alt={category.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = CATEGORY_IMAGE_FALLBACK
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-900">{category.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{category.type || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                        {category.restaurantCount || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={category.showOnHome !== false}
                        disabled={Boolean(updatingHomeVisibility[String(category?.id || category?.name || "")])}
                        onChange={() => handleToggleHomeVisibility(category)}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{category.restaurantsLabel || 'N/A'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredCategories.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              Showing {Math.min((currentPage - 1) * pageSize + 1, filteredCategories.length)} to {Math.min(currentPage * pageSize, filteredCategories.length)} of {filteredCategories.length} categories
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>

                <span className="text-sm font-medium text-slate-700">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Modal - Bottom Sheet */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isFilterOpen && (
              <div className="fixed inset-0 z-[100]">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black/50" 
                  onClick={() => setIsFilterOpen(false)}
                />
                
                {/* Modal Content */}
                <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-4 border-b">
                    <h2 className="text-lg font-bold text-gray-900">Filters and sorting</h2>
                    <button 
                      onClick={() => {
                        setActiveFilters(new Set())
                        setSortBy(null)
                        setSelectedCuisine(null)
                      }}
                      className="text-green-600 font-medium text-sm"
                    >
                      Clear all
                    </button>
                  </div>
                  
                  {/* Body */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar - Tabs */}
                    <div className="w-24 sm:w-28 bg-gray-50 border-r flex flex-col">
                      {[
                        { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                        { id: 'time', label: 'Time', icon: Timer },
                        { id: 'rating', label: 'Rating', icon: Star },
                        { id: 'distance', label: 'Distance', icon: MapPin },
                        { id: 'price', label: 'Dish Price', icon: IndianRupee },
                        { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                        { id: 'offers', label: 'Offers', icon: BadgePercent },
                        { id: 'trust', label: 'Trust', icon: ShieldCheck },
                      ].map((tab) => {
                        const Icon = tab.icon
                        const isActive = activeScrollSection === tab.id || activeFilterTab === tab.id
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              setActiveFilterTab(tab.id)
                              const section = filterSectionRefs.current[tab.id]
                              if (section) {
                                section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }
                            }}
                            className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${
                              isActive ? 'bg-white text-green-600' : 'text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r" />
                            )}
                            <Icon className="h-5 w-5" strokeWidth={1.5} />
                            <span className="text-xs font-medium leading-tight">{tab.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    
                    {/* Right Content Area - Scrollable */}
                    <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4">
                      {/* Sort By Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['sort'] = el}
                        data-section-id="sort"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sort by</h3>
                        <div className="flex flex-col gap-3">
                          {[
                            { id: null, label: 'Relevance' },
                            { id: 'price-low', label: 'Price: Low to High' },
                            { id: 'price-high', label: 'Price: High to Low' },
                            { id: 'rating-high', label: 'Rating: High to Low' },
                            { id: 'rating-low', label: 'Rating: Low to High' },
                          ].map((option) => (
                            <button
                              key={option.id || 'relevance'}
                              onClick={() => setSortBy(option.id)}
                              className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                                sortBy === option.id
                                  ? 'border-green-600 bg-green-50'
                                  : 'border-gray-200 hover:border-green-600'
                              }`}
                            >
                              <span className={`text-sm font-medium ${sortBy === option.id ? 'text-green-600' : 'text-gray-700'}`}>
                                {option.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Time Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['time'] = el}
                        data-section-id="time"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Delivery Time</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => toggleFilter('delivery-under-30')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('delivery-under-30') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-green-600' : 'text-gray-700'}`}>Under 30 mins</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('delivery-under-45')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('delivery-under-45') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-green-600' : 'text-gray-700'}`}>Under 45 mins</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Rating Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['rating'] = el}
                        data-section-id="rating"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Restaurant Rating</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => toggleFilter('rating-35-plus')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('rating-35-plus') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-green-600' : 'text-gray-700'}`}>Rated 3.5+</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('rating-4-plus')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('rating-4-plus') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-green-600' : 'text-gray-700'}`}>Rated 4.0+</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('rating-45-plus')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('rating-45-plus') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-green-600' : 'text-gray-700'}`}>Rated 4.5+</span>
                          </button>
                        </div>
                      </div>

                      {/* Distance Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['distance'] = el}
                        data-section-id="distance"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Distance</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => toggleFilter('distance-under-1km')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('distance-under-1km') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-green-600' : 'text-gray-700'}`}>Under 1 km</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('distance-under-2km')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('distance-under-2km') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-green-600' : 'text-gray-700'}`}>Under 2 km</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Price Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['price'] = el}
                        data-section-id="price"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dish Price</h3>
                        <div className="flex flex-col gap-3">
                          <button 
                            onClick={() => toggleFilter('price-under-200')}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                              activeFilters.has('price-under-200') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-green-600' : 'text-gray-700'}`}>Under ?200</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('price-under-500')}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                              activeFilters.has('price-under-500') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-green-600' : 'text-gray-700'}`}>Under ?500</span>
                          </button>
                        </div>
                      </div>

                      {/* Cuisine Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['cuisine'] = el}
                        data-section-id="cuisine"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cuisine</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {['Chinese', 'American', 'Japanese', 'Italian', 'Mexican', 'Indian', 'Asian', 'Seafood', 'Desserts', 'Cafe', 'Healthy'].map((cuisine) => (
                            <button
                              key={cuisine}
                              onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                              className={`px-4 py-3 rounded-xl border text-center transition-colors ${
                                selectedCuisine === cuisine
                                  ? 'border-green-600 bg-green-50'
                                  : 'border-gray-200 hover:border-green-600'
                              }`}
                            >
                              <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-green-600' : 'text-gray-700'}`}>
                                {cuisine}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Trust Markers Tab */}
                      {activeFilterTab === 'trust' && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-gray-900">Trust Markers</h3>
                          <div className="flex flex-col gap-3">
                            <button className="px-4 py-3 rounded-xl border border-gray-200 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm font-medium text-gray-700">Top Rated</span>
                            </button>
                            <button className="px-4 py-3 rounded-xl border border-gray-200 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm font-medium text-gray-700">Trusted by 1000+ users</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="flex items-center gap-4 px-4 py-4 border-t bg-white">
                    <button 
                      onClick={() => setIsFilterOpen(false)}
                      className="flex-1 py-3 text-center font-semibold text-gray-700"
                    >
                      Close
                    </button>
                    <button 
                      onClick={() => setIsFilterOpen(false)}
                      className={`flex-1 py-3 font-semibold rounded-xl transition-colors ${
                        activeFilters.size > 0 || sortBy || selectedCuisine
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {activeFilters.size > 0 || sortBy || selectedCuisine
                        ? 'Show results'
                        : 'Show results'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Create/Edit Category Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <div className="fixed inset-0 z-[200]">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black/50" 
                  onClick={handleCloseModal}
                />
                
                {/* Modal Content */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-xl font-bold text-slate-900">
                      {editingCategory ? 'Edit Category' : 'Add New Category'}
                    </h2>
                    <button 
                      onClick={handleCloseModal}
                      className="p-1 rounded hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                  
                  {/* Form */}
                  <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Category Type *
                      </label>
                      <select
                        required
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select category type</option>
                        <option value="Starters">Starters</option>
                        <option value="Main course">Main course</option>
                        <option value="Desserts">Desserts</option>
                        <option value="Beverages">Beverages</option>
                        <option value="Varieties">Varieties</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Category Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter category name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Category Image
                      </label>
                      <div className="space-y-3">
                        {/* Image Preview */}
                        {(imagePreview || formData.image) && (
                          <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-slate-300">
                            <img
                              src={imagePreview || formData.image}
                              alt="Category preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.src = CATEGORY_IMAGE_FALLBACK
                              }}
                            />
                            {imagePreview && (
                              <button
                                type="button"
                                onClick={handleRemoveImage}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* File Input */}
                        <div className="flex items-center gap-3">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            onChange={handleImageSelect}
                            className="hidden"
                            id="category-image-upload"
                          />
                          <label
                            htmlFor="category-image-upload"
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                          >
                            <Upload className="w-4 h-4 text-slate-600" />
                            <span className="text-sm text-slate-700">
                              {imagePreview ? 'Change Image' : 'Upload Image'}
                            </span>
                          </label>
                          {uploadingImage && (
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Supported formats: PNG, JPG, JPEG, WEBP (Max 5MB)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="status"
                        checked={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="status" className="text-sm font-medium text-slate-700">
                        Active Status
                      </label>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 pt-4">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        {editingCategory ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <style>{`
        @keyframes slideUp {
          0% {
            transform: translateY(100%);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}







