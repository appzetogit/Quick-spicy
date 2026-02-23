import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Bell,
  Sun,
  HelpCircle,
  User,
  Plus,
  Trophy,
  X,
  ChevronRight,
  ChevronLeft,
  Info,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Play
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGigStore } from "../store/gigStore"
import FeedNavbar from "../components/FeedNavbar"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

// Base stories data
const baseStories = [
  {
    id: "your-story",
    title: "Your story",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
    isAdd: true,
    content: [
      { type: "image", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1200&fit=crop" }
    ]
  },
  {
    id: "company",
    title: "", // Will be set dynamically
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=100&h=100&fit=crop",
    content: [
      { type: "image", url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=1200&fit=crop" },
      { type: "image", url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&h=1200&fit=crop" }
    ]
  },
  {
    id: "milestones",
    title: "Milestones",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100&h=100&fit=crop",
    content: [
      { type: "image", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=1200&fit=crop" }
    ]
  },
  {
    id: "happy-children",
    title: "Happy Children",
    image: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=100&h=100&fit=crop&crop=face",
    content: [
      { type: "image", url: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=1200&fit=crop" }
    ]
  }
]

// Mock videos data
const videos = [
  {
    id: 1,
    title: "Summer Mela Champions",
    thumbnail: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=600&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    views: 12500,
    likes: 890,
    dislikes: 12
  },
  {
    id: 2,
    title: "Delivery Excellence",
    thumbnail: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=600&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    views: 9800,
    likes: 650,
    dislikes: 8
  },
  {
    id: 3,
    title: "Team Spotlight",
    thumbnail: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&h=600&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    views: 15200,
    likes: 1200,
    dislikes: 15
  },
  {
    id: 4,
    title: "Success Stories",
    thumbnail: "https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=600&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    views: 11200,
    likes: 980,
    dislikes: 10
  },
  {
    id: 5,
    title: "Customer First",
    thumbnail: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=600&fit=crop",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    views: 8700,
    likes: 720,
    dislikes: 5
  }
]

export default function UpdatesPage() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [selectedStory, setSelectedStory] = useState(null)
  
  // Stories with dynamic company name
  const stories = useMemo(() => {
    return baseStories.map(story => {
      if (story.id === "company") {
        return { ...story, title: companyName }
      }
      return story
    })
  }, [companyName])
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [videoLikes, setVideoLikes] = useState({})
  const [videoDislikes, setVideoDislikes] = useState({})
  const [userReactions, setUserReactions] = useState({})
  const videoRef = useRef(null)
  const carouselRef1 = useRef(null)
  const carouselRef2 = useRef(null)
  const touchStartY = useRef(0)
  const touchEndY = useRef(0)
  
  const {
    isOnline,
    bookedGigs,
    goOnline,
    goOffline
  } = useGigStore()

  const handleStoryClick = (story) => {
    if (story.isAdd) {
      // Handle add story action
      return
    }
    setSelectedStory(story)
    setCurrentStoryIndex(0)
  }

  const handleNextStory = () => {
    if (selectedStory && currentStoryIndex < selectedStory.content.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1)
    } else {
      // Move to next story or close
      setSelectedStory(null)
    }
  }

  const handlePrevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1)
    }
  }

  const getCurrentDate = () => {
    const today = new Date()
    const day = today.getDate()
    const month = today.toLocaleString('en-US', { month: 'long' })
    return `${day} ${month}`
  }
  
  // Handle online toggle
  const handleToggleOnline = () => {
    if (isOnline) {
      goOffline()
    } else {
      if (bookedGigs.length === 0) {
        navigate("/delivery/gig")
      } else {
        goOnline()
      }
    }
  }

  // Video carousel handlers - Separate state for each carousel
  const [currentCarouselIndex1, setCurrentCarouselIndex1] = useState(0)
  const [currentCarouselIndex2, setCurrentCarouselIndex2] = useState(0)

  // First carousel handlers
  const handleCarouselScroll1 = () => {
    if (carouselRef1.current) {
      const scrollLeft = carouselRef1.current.scrollLeft
      const cardWidth = 320 // width of card + gap
      const index = Math.round(scrollLeft / cardWidth)
      setCurrentCarouselIndex1(index)
    }
  }

  const goToCarouselSlide1 = (index) => {
    if (carouselRef1.current) {
      const cardWidth = 320
      carouselRef1.current.scrollTo({
        left: index * cardWidth,
        behavior: "smooth"
      })
      setCurrentCarouselIndex1(index)
    }
  }

  // Second carousel handlers
  const handleCarouselScroll2 = () => {
    if (carouselRef2.current) {
      const scrollLeft = carouselRef2.current.scrollLeft
      const cardWidth = 320 // width of card + gap
      const index = Math.round(scrollLeft / cardWidth)
      setCurrentCarouselIndex2(index)
    }
  }

  const goToCarouselSlide2 = (index) => {
    if (carouselRef2.current) {
      const cardWidth = 320
      carouselRef2.current.scrollTo({
        left: index * cardWidth,
        behavior: "smooth"
      })
      setCurrentCarouselIndex2(index)
    }
  }

  const handleVideoClick = (video, index) => {
    setSelectedVideo(video)
    setCurrentVideoIndex(index)
    // Initialize likes/dislikes if not set
    if (!videoLikes[video.id]) {
      setVideoLikes(prev => ({ ...prev, [video.id]: video.likes }))
      setVideoDislikes(prev => ({ ...prev, [video.id]: video.dislikes }))
    }
  }

  const handleLike = (videoId) => {
    const currentReaction = userReactions[videoId]
    if (currentReaction === 'like') {
      // Remove like
      setVideoLikes(prev => ({ ...prev, [videoId]: prev[videoId] - 1 }))
      setUserReactions(prev => {
        const newReactions = { ...prev }
        delete newReactions[videoId]
        return newReactions
      })
    } else {
      // Add like, remove dislike if exists
      setVideoLikes(prev => ({ ...prev, [videoId]: (prev[videoId] || 0) + 1 }))
      if (currentReaction === 'dislike') {
        setVideoDislikes(prev => ({ ...prev, [videoId]: prev[videoId] - 1 }))
      }
      setUserReactions(prev => ({ ...prev, [videoId]: 'like' }))
    }
  }

  const handleDislike = (videoId) => {
    const currentReaction = userReactions[videoId]
    if (currentReaction === 'dislike') {
      // Remove dislike
      setVideoDislikes(prev => ({ ...prev, [videoId]: prev[videoId] - 1 }))
      setUserReactions(prev => {
        const newReactions = { ...prev }
        delete newReactions[videoId]
        return newReactions
      })
    } else {
      // Add dislike, remove like if exists
      setVideoDislikes(prev => ({ ...prev, [videoId]: (prev[videoId] || 0) + 1 }))
      if (currentReaction === 'like') {
        setVideoLikes(prev => ({ ...prev, [videoId]: prev[videoId] - 1 }))
      }
      setUserReactions(prev => ({ ...prev, [videoId]: 'dislike' }))
    }
  }

  const handleCloseVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause()
    }
    setSelectedVideo(null)
  }

  const handleNextVideo = () => {
    if (currentVideoIndex < videos.length - 1) {
      const nextIndex = currentVideoIndex + 1
      setCurrentVideoIndex(nextIndex)
      setSelectedVideo(videos[nextIndex])
      if (videoRef.current) {
        videoRef.current.load()
        videoRef.current.play()
      }
    }
  }

  const handlePrevVideo = () => {
    if (currentVideoIndex > 0) {
      const prevIndex = currentVideoIndex - 1
      setCurrentVideoIndex(prevIndex)
      setSelectedVideo(videos[prevIndex])
      if (videoRef.current) {
        videoRef.current.load()
        videoRef.current.play()
      }
    }
  }

  // Touch handlers for vertical swipe
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e) => {
    touchEndY.current = e.touches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!touchStartY.current || !touchEndY.current) return
    
    const distance = touchStartY.current - touchEndY.current
    const minSwipeDistance = 50

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // Swiped up - next video
        handleNextVideo()
      } else {
        // Swiped down - previous video
        handlePrevVideo()
      }
    }

    touchStartY.current = 0
    touchEndY.current = 0
  }

  // Initialize video likes/dislikes
  useEffect(() => {
    const initialLikes = {}
    const initialDislikes = {}
    videos.forEach(video => {
      initialLikes[video.id] = video.likes
      initialDislikes[video.id] = video.dislikes
    })
    setVideoLikes(initialLikes)
    setVideoDislikes(initialDislikes)
  }, [])

  return (
    <div className="min-h-screen bg-white  text-gray-900 overflow-x-hidden pb-24">
      {/* Top Bar */}
      <FeedNavbar
        isOnline={isOnline}
        onToggleOnline={handleToggleOnline}
        onEmergencyClick={() => {}}
        onHelpClick={() => {}}
        className=""
      />

      {/* Stories Section */}
      <div className="px-4 py-4 overflow-x-auto scrollbar-hide bg-transparent">
        <div className="flex gap-4">
          {stories.map((story) => (
            <div
              key={story.id}
              className="flex flex-col items-center gap-2 shrink-0 cursor-pointer"
              onClick={() => handleStoryClick(story)}
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full overflow-hidden">
                  {story.isAdd ? (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <img 
                        src={story.image}
                        alt={story.title}
                        className="w-full h-full object-cover opacity-50"
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    </div>
                  ) : (
                    <img 
                      src={story.image}
                      alt={story.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(story.title)}&background=ff8100&color=fff&size=64`
                      }}
                    />
                  )}
                </div>
                {story.isAdd && (
                  <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 border-2 border-white shadow-sm">
                    <Plus className="w-4 h-4 text-gray-800" />
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-600 text-center max-w-[64px] truncate">
                {story.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications Banner */}
      <div className="mx-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative">
            <Bell className="w-5 h-5 text-blue-600" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Check all your notifications</p>
            <p className="text-xs text-gray-600">Today, {getCurrentDate()}</p>
          </div>
        </div>
        <Button
          onClick={() => navigate("/delivery/notifications")}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 h-auto"
        >
          View
        </Button>
      </div>

      <div className="bg-black text-white py-6">
      <div className="px-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold font-medium">Cares for you</span>
          </div>
          <button className="flex items-center gap-1 text-sm text-white hover:text-gray-300 transition-colors">
            <span>View all</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

        {/* Video Carousel */}
        <div className="relative">
          {/* Carousel Container */}
          <div
            ref={carouselRef1}
            onScroll={handleCarouselScroll1}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {videos.map((video) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0 w-[280px] cursor-pointer"
                onClick={() => handleVideoClick(video, videos.findIndex(v => v.id === video.id))}
              >
                <div className="relative rounded-lg overflow-hidden bg-gray-900">
                  {/* Thumbnail - Horizontal */}
                  <div className="relative aspect-video">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=600&fit=crop"
                      }}
                    />
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-white ml-1" fill="white" />
                      </div>
                    </div>
                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                      <h3 className="text-white font-semibold text-sm">{video.title}</h3>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Dots Indicator - Center Below */}
          <div className="flex justify-center gap-2 mt-4">
            {videos.map((_, index) => (
              <button
                key={index}
                onClick={() => goToCarouselSlide1(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentCarouselIndex1
                    ? "bg-white w-6"
                    : "bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="text-black py-6">
        {/* Header */}
      <div className="px-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-black font-semibold font-medium">Videos for you</span>
          </div>
          <button className="flex items-center gap-1 text-sm text-black hover:text-gray-300 transition-colors">
            <span>View all</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

        {/* Video Carousel */}
        <div className="relative">
          {/* Carousel Container */}
          <div
            ref={carouselRef2}
            onScroll={handleCarouselScroll2}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {videos.map((video) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0 w-[280px] cursor-pointer"
                onClick={() => handleVideoClick(video, videos.findIndex(v => v.id === video.id))}
              >
                <div className="relative rounded-lg overflow-hidden bg-gray-900">
                  {/* Thumbnail - Horizontal */}
                  <div className="relative aspect-video">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=600&fit=crop"
                    }}
                  />
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-white ml-1" fill="white" />
                      </div>
                    </div>
                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                      <h3 className="text-white font-semibold text-sm">{video.title}</h3>
                    </div>
                  </div>
                </div>
          </motion.div>
        ))}
          </div>

          {/* Dots Indicator - Center Below */}
          <div className="flex justify-center gap-2 mt-4">
            {videos.map((_, index) => (
              <button
                key={index}
                onClick={() => goToCarouselSlide2(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentCarouselIndex2
                    ? "bg-black w-6"
                    : "bg-black/40 hover:bg-black/60"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Story Viewer Modal */}
      <AnimatePresence>
        {selectedStory && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStory(null)}
              className="fixed inset-0 bg-black z-50"
            />
            
            {/* Story Content */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                if (x > rect.width / 2) {
                  handleNextStory()
                } else {
                  handlePrevStory()
                }
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedStory(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>

              {/* Story Image */}
              {selectedStory.content[currentStoryIndex] && (
                <motion.img
                  key={currentStoryIndex}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  src={selectedStory.content[currentStoryIndex].url}
                  alt={selectedStory.title}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedStory.title)}&background=ff8100&color=fff&size=800`
                  }}
                />
              )}

              {/* Story Title Overlay */}
              <div className="absolute bottom-20 left-0 right-0 px-4">
                <div className="bg-black/50 backdrop-blur-sm rounded-lg p-3">
                  <h3 className="text-white font-semibold">{selectedStory.title}</h3>
                </div>
              </div>

              {/* Progress Indicator */}
              {selectedStory.content.length > 1 && (
                <div className="absolute top-4 left-4 right-4 flex gap-1">
                  {selectedStory.content.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1 flex-1 rounded-full ${
                        index === currentStoryIndex ? "bg-white" : "bg-white/30"
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Video Player Modal */}
      <AnimatePresence>
        {selectedVideo && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-[60]"
            />
            
            {/* Video Player */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black"
            >
              {/* Back Button */}
              <button
                onClick={handleCloseVideo}
                className="absolute top-4 left-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
              >
                <ArrowLeft className="w-6 h-6 text-white" />
              </button>

              {/* Video Container - Fullscreen Vertical */}
              <div 
                className="w-full h-full flex items-center justify-center"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  {/* Video Element - Fullscreen Vertical */}
                  <video
                    ref={videoRef}
                    src={selectedVideo.videoUrl}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    playsInline
                    onError={(e) => {
                      console.error("Video load error:", e)
                    }}
                  />

                  {/* Video Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-6">
                    <h3 className="text-white font-bold text-lg mb-4">{selectedVideo.title}</h3>
                    
                    {/* Actions Bar - Bottom Right */}
                    <div className="flex items-center justify-end gap-4">
                      {/* Like Button */}
                      <button
                        onClick={() => handleLike(selectedVideo.id)}
                        className={`flex flex-col items-center gap-1 transition-colors ${
                          userReactions[selectedVideo.id] === 'like'
                            ? 'text-blue-500'
                            : 'text-white hover:text-blue-400'
                        }`}
                      >
                        <ThumbsUp className="w-6 h-6" fill={userReactions[selectedVideo.id] === 'like' ? 'currentColor' : 'none'} />
                        <span className="text-xs font-medium">
                          {videoLikes[selectedVideo.id] || selectedVideo.likes}
                        </span>
                      </button>

                      {/* Dislike Button */}
                      <button
                        onClick={() => handleDislike(selectedVideo.id)}
                        className={`flex flex-col items-center gap-1 transition-colors ${
                          userReactions[selectedVideo.id] === 'dislike'
                            ? 'text-red-500'
                            : 'text-white hover:text-red-400'
                        }`}
                      >
                        <ThumbsDown className="w-6 h-6" fill={userReactions[selectedVideo.id] === 'dislike' ? 'currentColor' : 'none'} />
                        <span className="text-xs font-medium">
                          {videoDislikes[selectedVideo.id] || selectedVideo.dislikes}
                        </span>
                      </button>

                      {/* Views */}
                      <div className="flex items-center gap-2 text-white">
                        <Eye className="w-5 h-5" />
                        <span className="text-sm font-medium">
                          {selectedVideo.views.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Navigation Arrows */}
                  {currentVideoIndex > 0 && (
                    <button
                      onClick={handlePrevVideo}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                    >
                      <ChevronLeft className="w-6 h-6 text-white" />
                    </button>
                  )}
                  
                  {currentVideoIndex < videos.length - 1 && (
                    <button
                      onClick={handleNextVideo}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                    >
                      <ChevronRight className="w-6 h-6 text-white" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

