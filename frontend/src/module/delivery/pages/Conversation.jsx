import { useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  Send,
  Search
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function Conversation() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")

  const conversations = [
    {
      id: 1,
      name: "Hungry Puppets",
      lastMessage: "Order will be ready in 10 minutes",
      time: "2 min ago",
      unread: 2,
      avatar: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=100&h=100&fit=crop"
    },
    {
      id: 2,
      name: "Customer - John Doe",
      lastMessage: "Thank you for the delivery!",
      time: "1 hour ago",
      unread: 0,
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face"
    },
    {
      id: 3,
      name: "Pizza Palace",
      lastMessage: "Your order is being prepared",
      time: "3 hours ago",
      unread: 1,
      avatar: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=100&h=100&fit=crop"
    }
  ]

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={() => navigate("/delivery/profile")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Conversations</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 pb-24 md:pb-6">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ff8100] focus:border-transparent outline-none bg-white"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="space-y-2">
          {filteredConversations.map((conversation, index) => (
            <motion.div
              key={conversation.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card 
                className="bg-white shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  // Navigate to chat detail page
                  console.log("Open conversation:", conversation.id)
                }}
              >
                <CardContent className="px-2 md:px-4 py-1.5 md:py-3 gap-0">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <img 
                        src={conversation.avatar}
                        alt={conversation.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      {conversation.unread > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {conversation.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-gray-900 font-semibold text-sm md:text-base truncate">
                          {conversation.name}
                        </p>
                        <span className="text-gray-500 text-xs flex-shrink-0 ml-2">
                          {conversation.time}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs md:text-sm truncate">
                        {conversation.lastMessage}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {filteredConversations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No conversations found</p>
          </div>
        )}
      </div>

    </div>
  )
}

