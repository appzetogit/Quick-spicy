import { useState, useEffect, useRef } from "react"
import { Upload, Trash2, Image as ImageIcon, Loader2, AlertCircle, CheckCircle2, ArrowUp, ArrowDown, Layout, Link as LinkIcon, Tag, UtensilsCrossed, FileText, Edit, X } from "lucide-react"
import api from "@/lib/api"
import { getModuleToken } from "@/lib/utils/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function DiningManagement() {
    const [activeTab, setActiveTab] = useState('categories')

    // Categories
    const [categories, setCategories] = useState([])
    const [categoriesLoading, setCategoriesLoading] = useState(true)
    const [categoriesUploading, setCategoriesUploading] = useState(false)
    const [categoriesDeleting, setCategoriesDeleting] = useState(null)
    const [categoryName, setCategoryName] = useState("")
    const [categoryFile, setCategoryFile] = useState(null)
    const categoryFileInputRef = useRef(null)

    // Banners
    const [banners, setBanners] = useState([])
    const [bannersLoading, setBannersLoading] = useState(true)
    const [bannersUploading, setBannersUploading] = useState(false)
    const [bannersDeleting, setBannersDeleting] = useState(null)
    const [bannerFile, setBannerFile] = useState(null)
    const [bannerPercentageOff, setBannerPercentageOff] = useState("")
    const [bannerTagline, setBannerTagline] = useState("")
    const [bannerRestaurant, setBannerRestaurant] = useState("")
    const [restaurantsList, setRestaurantsList] = useState([])
    const [editingBannerId, setEditingBannerId] = useState(null)
    const bannerFileInputRef = useRef(null)

    // Stories
    const [stories, setStories] = useState([])
    const [storiesLoading, setStoriesLoading] = useState(true)
    const [storiesUploading, setStoriesUploading] = useState(false)
    const [storiesDeleting, setStoriesDeleting] = useState(null)
    const [storyName, setStoryName] = useState("")
    const [storyFile, setStoryFile] = useState(null)
    const [editingStoryId, setEditingStoryId] = useState(null)
    const storyFileInputRef = useRef(null)

    // Common
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const getAuthConfig = (additionalConfig = {}) => {
        const adminToken = getModuleToken('admin')
        if (!adminToken) return additionalConfig
        return {
            ...additionalConfig,
            headers: {
                ...additionalConfig.headers,
                Authorization: `Bearer ${adminToken.trim()}`,
            }
        }
    }

    useEffect(() => {
        fetchCategories()
        fetchBanners()
        fetchStories()
        fetchRestaurantsList()
    }, [])

    // ==================== CATEGORIES ====================
    const fetchCategories = async () => {
        try {
            setCategoriesLoading(true)
            const response = await api.get('/admin/dining/categories', getAuthConfig())
            if (response.data.success) setCategories(response.data.data.categories)
        } catch (err) { console.error(err) } finally { setCategoriesLoading(false) }
    }

    const handleCreateCategory = async () => {
        if (!categoryName || !categoryFile) return setError("Name and Image are required")
        try {
            setCategoriesUploading(true)
            const formData = new FormData()
            formData.append('name', categoryName)
            formData.append('image', categoryFile)

            const response = await api.post('/admin/dining/categories', formData, getAuthConfig({
                headers: { 'Content-Type': 'multipart/form-data' }
            }))

            if (response.data.success) {
                setSuccess("Category created successfully")
                setCategoryName("")
                setCategoryFile(null)
                if (categoryFileInputRef.current) categoryFileInputRef.current.value = ""
                fetchCategories()
            }
        } catch (err) { setError(err.response?.data?.message || "Failed to create category") }
        finally { setCategoriesUploading(false) }
    }

    const handleDeleteCategory = async (id) => {
        if (!window.confirm("Delete this category?")) return
        try {
            setCategoriesDeleting(id)
            await api.delete(`/admin/dining/categories/${id}`, getAuthConfig())
            fetchCategories()
            setSuccess("Category deleted")
        } catch (err) { setError("Failed to delete category") }
        finally { setCategoriesDeleting(null) }
    }

    // ==================== BANNERS ====================
    const fetchBanners = async () => {
        try {
            setBannersLoading(true)
            const response = await api.get('/admin/dining/offer-banners', getAuthConfig())
            if (response.data.success) setBanners(response.data.data.banners)
        } catch (err) { console.error(err) } finally { setBannersLoading(false) }
    }

    const fetchRestaurantsList = async () => {
        try {
            const response = await api.get('/admin/dining/restaurants-list', getAuthConfig())
            if (response.data.success) setRestaurantsList(response.data.data.restaurants)
        } catch (err) { console.error(err) }
    }

    const handleSubmitBanner = async () => {
        if (!editingBannerId && (!bannerFile || !bannerPercentageOff || !bannerTagline || !bannerRestaurant)) {
            return setError("All fields and Image are required")
        }
        if (editingBannerId && (!bannerPercentageOff || !bannerTagline || !bannerRestaurant)) {
            return setError("All text fields are required")
        }

        try {
            setBannersUploading(true)
            const formData = new FormData()
            if (bannerFile) formData.append('image', bannerFile)
            formData.append('percentageOff', bannerPercentageOff)
            formData.append('tagline', bannerTagline)
            formData.append('restaurant', bannerRestaurant)

            let response;
            if (editingBannerId) {
                response = await api.put(`/admin/dining/offer-banners/${editingBannerId}`, formData, getAuthConfig({
                    headers: { 'Content-Type': 'multipart/form-data' }
                }))
            } else {
                response = await api.post('/admin/dining/offer-banners', formData, getAuthConfig({
                    headers: { 'Content-Type': 'multipart/form-data' }
                }))
            }

            if (response.data.success) {
                setSuccess(editingBannerId ? "Banner updated successfully" : "Banner created successfully")
                resetBannerForm()
                fetchBanners()
            }
        } catch (err) { setError(err.response?.data?.message || (editingBannerId ? "Failed to update banner" : "Failed to create banner")) }
        finally { setBannersUploading(false) }
    }

    const resetBannerForm = () => {
        setBannerFile(null)
        setBannerPercentageOff("")
        setBannerTagline("")
        setBannerRestaurant("")
        setEditingBannerId(null)
        if (bannerFileInputRef.current) bannerFileInputRef.current.value = ""
    }

    const handleEditBanner = (banner) => {
        setEditingBannerId(banner._id)
        setBannerPercentageOff(banner.percentageOff)
        setBannerTagline(banner.tagline)
        setBannerRestaurant(banner.restaurant._id || banner.restaurant)
        setBannerFile(null)
        if (bannerFileInputRef.current) bannerFileInputRef.current.value = ""
    }

    const handleDeleteBanner = async (id) => {
        if (!window.confirm("Delete this banner?")) return
        try {
            setBannersDeleting(id)
            await api.delete(`/admin/dining/offer-banners/${id}`, getAuthConfig())
            fetchBanners()
            setSuccess("Banner deleted")
        } catch (err) { setError("Failed to delete banner") }
        finally { setBannersDeleting(null) }
    }

    // ==================== STORIES ====================
    const fetchStories = async () => {
        try {
            setStoriesLoading(true)
            const response = await api.get('/admin/dining/stories', getAuthConfig())
            if (response.data.success) setStories(response.data.data.stories)
        } catch (err) { console.error(err) } finally { setStoriesLoading(false) }
    }

    const handleSubmitStory = async () => {
        if (!editingStoryId && (!storyName || !storyFile)) return setError("Name and Image are required")
        if (editingStoryId && !storyName) return setError("Name is required")

        try {
            setStoriesUploading(true)
            const formData = new FormData()
            formData.append('name', storyName)
            if (storyFile) formData.append('image', storyFile)

            let response;
            if (editingStoryId) {
                response = await api.put(`/admin/dining/stories/${editingStoryId}`, formData, getAuthConfig({
                    headers: { 'Content-Type': 'multipart/form-data' }
                }))
            } else {
                response = await api.post('/admin/dining/stories', formData, getAuthConfig({
                    headers: { 'Content-Type': 'multipart/form-data' }
                }))
            }

            if (response.data.success) {
                setSuccess(editingStoryId ? "Story updated successfully" : "Story created successfully")
                resetStoryForm()
                fetchStories()
            }
        } catch (err) { setError(err.response?.data?.message || (editingStoryId ? "Failed to update story" : "Failed to create story")) }
        finally { setStoriesUploading(false) }
    }

    const resetStoryForm = () => {
        setStoryName("")
        setStoryFile(null)
        setEditingStoryId(null)
        if (storyFileInputRef.current) storyFileInputRef.current.value = ""
    }

    const handleEditStory = (story) => {
        setEditingStoryId(story._id)
        setStoryName(story.name)
        setStoryFile(null)
        if (storyFileInputRef.current) storyFileInputRef.current.value = ""
    }

    const handleDeleteStory = async (id) => {
        if (!window.confirm("Delete this story?")) return
        try {
            setStoriesDeleting(id)
            await api.delete(`/admin/dining/stories/${id}`, getAuthConfig())
            fetchStories()
            setSuccess("Story deleted")
        } catch (err) { setError("Failed to delete story") }
        finally { setStoriesDeleting(null) }
    }

    const tabs = [
        { id: 'categories', label: 'Dining Categories', icon: Layout },
        { id: 'banners', label: 'Dining Banners', icon: ImageIcon },
        { id: 'stories', label: 'Dining Stories', icon: FileText },
    ]

    return (
        <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                            <UtensilsCrossed className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Dining Banners</h1>
                            <p className="text-sm text-slate-600 mt-1">Manage dining categories, banners, and stories</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 mb-6">
                    <div className="flex gap-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Messages */}
                {success && <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl"><CheckCircle2 className="w-5 h-5" />{success}</div>}
                {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl"><AlertCircle className="w-5 h-5" />{error}</div>}

                {/* Content */}
                {activeTab === 'categories' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Add Category</h2>
                                <div className="space-y-4">
                                    <div>
                                        <Label>Name</Label>
                                        <Input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="Category Name" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Image</Label>
                                        <Input type="file" ref={categoryFileInputRef} onChange={e => setCategoryFile(e.target.files[0])} accept="image/*" className="mt-1" />
                                    </div>
                                    <Button onClick={handleCreateCategory} disabled={categoriesUploading} className="w-full bg-blue-600 hover:bg-blue-700">
                                        {categoriesUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Category"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Categories List</h2>
                                {categoriesLoading ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categories.map(cat => (
                                            <div key={cat._id} className="border rounded-lg overflow-hidden group relative">
                                                <img src={cat.imageUrl} alt={cat.name} className="w-full h-32 object-cover" />
                                                <div className="p-3 bg-white">
                                                    <p className="font-medium text-slate-900">{cat.name}</p>
                                                </div>
                                                <button onClick={() => handleDeleteCategory(cat._id)} className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {categoriesDeleting === cat._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        ))}
                                        {categories.length === 0 && <p className="text-slate-500 text-center col-span-full py-8">No categories found.</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'banners' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">{editingBannerId ? "Edit Offer Banner" : "Add Offer Banner"}</h2>
                                <div className="space-y-4">
                                    <div>
                                        <Label>Image</Label>
                                        <Input type="file" ref={bannerFileInputRef} onChange={e => setBannerFile(e.target.files[0])} accept="image/*" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Percentage Off</Label>
                                        <Input value={bannerPercentageOff} onChange={e => setBannerPercentageOff(e.target.value)} placeholder="e.g. 50% OFF" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Tagline</Label>
                                        <Input value={bannerTagline} onChange={e => setBannerTagline(e.target.value)} placeholder="e.g. On selected items" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Restaurant</Label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                                            value={bannerRestaurant}
                                            onChange={e => setBannerRestaurant(e.target.value)}
                                        >
                                            <option value="">Select Restaurant</option>
                                            {restaurantsList.map(r => (
                                                <option key={r._id} value={r._id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <Button onClick={handleSubmitBanner} disabled={bannersUploading} className="w-full bg-blue-600 hover:bg-blue-700">
                                        {bannersUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingBannerId ? "Update Banner" : "Create Banner")}
                                    </Button>
                                    {editingBannerId && (
                                        <Button onClick={resetBannerForm} variant="outline" className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                                            Cancel Edit
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Offer Banners List</h2>
                                {bannersLoading ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {banners.map(banner => (
                                            <div key={banner._id} className="border rounded-lg overflow-hidden group relative">
                                                <img src={banner.imageUrl} alt={banner.tagline} className="w-full h-32 object-cover" />
                                                <div className="p-3 bg-white">
                                                    <p className="font-bold text-slate-900">{banner.percentageOff}</p>
                                                    <p className="text-sm text-slate-600">{banner.tagline}</p>
                                                    <p className="text-xs text-blue-600 mt-1">{banner.restaurant?.name}</p>
                                                </div>
                                                <button onClick={() => handleDeleteBanner(banner._id)} className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {bannersDeleting === banner._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => handleEditBanner(banner)} className="absolute top-2 right-10 p-1.5 bg-blue-100 text-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {banners.length === 0 && <p className="text-slate-500 text-center col-span-full py-8">No banners found.</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'stories' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">{editingStoryId ? "Edit Story" : "Add Story"}</h2>
                                <div className="space-y-4">
                                    <div>
                                        <Label>Name</Label>
                                        <Input value={storyName} onChange={e => setStoryName(e.target.value)} placeholder="Story Name" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Image</Label>
                                        <Input type="file" ref={storyFileInputRef} onChange={e => setStoryFile(e.target.files[0])} accept="image/*" className="mt-1" />
                                    </div>
                                    <Button onClick={handleSubmitStory} disabled={storiesUploading} className="w-full bg-blue-600 hover:bg-blue-700">
                                        {storiesUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingStoryId ? "Update Story" : "Create Story")}
                                    </Button>
                                    {editingStoryId && (
                                        <Button onClick={resetStoryForm} variant="outline" className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                                            Cancel Edit
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Stories List</h2>
                                {storiesLoading ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {stories.map(story => (
                                            <div key={story._id} className="border rounded-lg overflow-hidden group relative">
                                                <img src={story.imageUrl} alt={story.name} className="w-full h-32 object-cover" />
                                                <div className="p-3 bg-white">
                                                    <p className="font-medium text-slate-900">{story.name}</p>
                                                </div>
                                                <button onClick={() => handleDeleteStory(story._id)} className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {storiesDeleting === story._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => handleEditStory(story)} className="absolute top-2 right-10 p-1.5 bg-blue-100 text-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {stories.length === 0 && <p className="text-slate-500 text-center col-span-full py-8">No stories found.</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
