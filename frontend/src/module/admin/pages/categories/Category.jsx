import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Search, Download, ChevronDown, ChevronLeft, ChevronRight, Loader2, Upload, X } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportReportsToExcel } from "../../components/reports/reportsExportUtils"
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
    debugLog('API Base URL:', API_BASE_URL)
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
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      })
      
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
          fontSize: 8,
          textColor: [30, 30, 30]
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        styles: {
          cellPadding: 3,
          lineColor: [200, 200, 200],
          lineWidth: 0.5,
          overflow: "linebreak",
          cellWidth: "wrap",
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 14 }, // SL
          1: { cellWidth: 58 }, // Category Name
          2: { cellWidth: 34 }, // Source
          3: { cellWidth: 22 }, // Restaurants
          4: { cellWidth: 24 }, // Show On Home
          5: { cellWidth: 122 }  // Restaurant Names
        },
        margin: { top: 35, right: 10, bottom: 18, left: 10 },
        tableWidth: "auto",
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

  const handleExportExcel = () => {
    try {
      const headers = [
        { key: "sl", label: "SL" },
        { key: "name", label: "Category Name" },
        { key: "type", label: "Source" },
        { key: "restaurantCount", label: "Restaurants" },
        { key: "showOnHome", label: "Show On Home" },
        { key: "restaurantsLabel", label: "Restaurant Names" },
      ]

      const rows = filteredCategories.map((category, index) => ({
        sl: category.sl || index + 1,
        name: category.name || "N/A",
        type: category.type || "N/A",
        restaurantCount: category.restaurantCount || 0,
        showOnHome: category.showOnHome !== false ? "Yes" : "No",
        restaurantsLabel: category.restaurantsLabel || "N/A",
      }))

      exportReportsToExcel(rows, headers, "categories")
      toast.success("Excel exported successfully!")
    } catch (error) {
      debugError("Error exporting Excel:", error)
      toast.error("Failed to export Excel")
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={filteredCategories.length === 0}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-lg shadow-lg">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                  <Download className="w-4 h-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                  <Download className="w-4 h-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-100 text-slate-600">
              Showing categories from all restaurant menus
            </div>
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

    </div>
  )
}







