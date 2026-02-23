import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, HelpCircle, Check, Gift, Mail, Building2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

// Import banner
// Using placeholder for gift card banner
const giftCardBanner = "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1200&h=400&fit=crop"

// Gift card categories with their card designs
const giftCardCategories = [
  {
    id: 'birthday',
    label: 'Birthday',
    cardTitle: 'HAPPY\nBIRTHDAY',
    gradient: 'from-rose-400 via-red-400 to-rose-500',
    bgColor: '#f87171',
    emojis: ['🎂', '🎁', '🥳', '🎉'],
    message: 'Have a yumazing birthday!'
  },
  {
    id: 'anniversary',
    label: 'Anniversary',
    cardTitle: 'HAPPY\nANNIVERSARY',
    gradient: 'from-pink-400 via-rose-400 to-pink-500',
    bgColor: '#fb7185',
    emojis: ['💕', '💑', '🥂', '❤️'],
    message: 'Celebrating your special day!'
  },
  {
    id: 'wedding',
    label: 'Wedding',
    cardTitle: 'HAPPY\nWEDDING',
    gradient: 'from-amber-300 via-yellow-300 to-amber-400',
    bgColor: '#fcd34d',
    emojis: ['💒', '💍', '👰', '🤵'],
    message: 'Wishing you a lifetime of happiness!'
  },
  {
    id: 'promotion',
    label: 'Promotion',
    cardTitle: 'CONGRATS\nON PROMOTION',
    gradient: 'from-emerald-400 via-green-400 to-emerald-500',
    bgColor: '#34d399',
    emojis: ['🎊', '🏆', '⭐', '🚀'],
    message: 'Keep achieving great things!'
  },
  {
    id: 'thankyou',
    label: 'Thank You',
    cardTitle: 'THANK\nYOU',
    gradient: 'from-sky-400 via-blue-400 to-sky-500',
    bgColor: '#38bdf8',
    emojis: ['🙏', '💐', '✨', '💝'],
    message: 'Thanks for being amazing!'
  },
  {
    id: 'festival',
    label: 'Festival',
    cardTitle: 'HAPPY\nFESTIVALS',
    gradient: 'from-purple-400 via-violet-400 to-purple-500',
    bgColor: '#a78bfa',
    emojis: ['🪔', '🎆', '🌟', '🎇'],
    message: 'May the festivities bring you joy!'
  }
]

const amountOptions = [
  { value: 1000, label: '₹1,000' },
  { value: 2000, label: '₹2,000', popular: true },
  { value: 5000, label: '₹5,000' },
  { value: 'custom', label: 'Custom' }
]

export default function GiftCards() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState('birthday')
  const [selectedAmount, setSelectedAmount] = useState(2000)
  const [customAmount, setCustomAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)

  const currentCategory = giftCardCategories.find(cat => cat.id === selectedCategory)

  // Handle category change with animation
  const handleCategoryChange = (categoryId) => {
    if (categoryId === selectedCategory) return
    setIsAnimating(true)
    setTimeout(() => {
      setSelectedCategory(categoryId)
      const category = giftCardCategories.find(cat => cat.id === categoryId)
      setMessage(category?.message || '')
      setTimeout(() => setIsAnimating(false), 50)
    }, 150)
  }

  // Set default message on mount
  useEffect(() => {
    setMessage(currentCategory?.message || '')
  }, [])

  const displayAmount = selectedAmount === 'custom'
    ? (customAmount ? `₹${Number(customAmount).toLocaleString('en-IN')}` : '₹0')
    : `₹${selectedAmount.toLocaleString('en-IN')}`

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] pb-24">
      {/* Banner Section */}
      <div className="relative">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 w-10 h-10 bg-white/20 dark:bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 dark:hover:bg-black/30 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        {/* Help Button */}
        <Link
          to="/user/help"
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 text-white font-medium text-sm"
        >
          <HelpCircle className="h-4 w-4" />
          <span>Help</span>
        </Link>

        {/* Banner Image */}
        <div className="relative w-full overflow-hidden min-h-[25vh] md:min-h-[30vh]">
          <div className="absolute inset-0 z-0">
            <img
              src={giftCardBanner}
              alt="Gift Cards"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8">
        <div className="max-w-4xl md:max-w-5xl lg:max-w-6xl mx-auto space-y-6 md:space-y-8">
          {/* Category Tabs - Horizontal Scrollable */}
          <div
            className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {giftCardCategories.map((category) => {
              const isSelected = selectedCategory === category.id
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all duration-300 flex-shrink-0 ${isSelected
                      ? 'bg-white dark:bg-[#1a1a1a] border-2 border-gray-900 dark:border-gray-200 text-gray-900 dark:text-white shadow-md'
                      : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                  {category.label}
                </button>
              )
            })}
          </div>

          {/* Gift Card Preview */}
          <div className="flex justify-center">
            <div className="relative">
              {/* Gift Card */}
              <div
                className={`relative w-72 h-44 sm:w-80 sm:h-48 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
                  }`}
                style={{
                  background: `linear-gradient(135deg, ${currentCategory?.bgColor}ee 0%, ${currentCategory?.bgColor} 50%, ${currentCategory?.bgColor}dd 100%)`
                }}
              >
                {/* Decorative Emojis */}
                <div className="absolute top-3 left-3 text-2xl sm:text-3xl animate-bounce" style={{ animationDelay: '0ms', animationDuration: '2s' }}>
                  {currentCategory?.emojis[0]}
                </div>
                <div className="absolute top-3 right-3 text-2xl sm:text-3xl animate-bounce" style={{ animationDelay: '200ms', animationDuration: '2.2s' }}>
                  {currentCategory?.emojis[1]}
                </div>
                <div className="absolute bottom-10 left-4 text-2xl sm:text-3xl animate-bounce" style={{ animationDelay: '400ms', animationDuration: '2.4s' }}>
                  {currentCategory?.emojis[2]}
                </div>
                <div className="absolute bottom-10 right-4 text-2xl sm:text-3xl animate-bounce" style={{ animationDelay: '600ms', animationDuration: '2.6s' }}>
                  {currentCategory?.emojis[3]}
                </div>

                {/* Card Title */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <h2 className="text-white text-2xl sm:text-3xl font-black text-center leading-tight tracking-wide whitespace-pre-line drop-shadow-lg">
                    {currentCategory?.cardTitle}
                  </h2>
                  <p className="text-white/80 text-xs mt-2 font-medium">{companyName.toLowerCase()}</p>
                </div>

                {/* Sparkle Effects */}
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-white/60 rounded-full animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-white/50 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                <div className="absolute bottom-1/3 left-1/3 w-1 h-1 bg-white/40 rounded-full animate-ping" style={{ animationDuration: '1.8s', animationDelay: '0.3s' }} />
              </div>

              {/* Selection Checkmark */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-[#EB590E] rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                <Check className="h-5 w-5 text-white" strokeWidth={3} />
              </div>
            </div>
          </div>

          {/* Choose Amount Section */}
          <section className="space-y-4">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
              CHOOSE AMOUNT
            </h3>

            <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
              <CardContent className="p-4 space-y-4">
                {/* Amount Display */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Gift card amount</span>
                  <span className="text-gray-900 dark:text-white font-bold text-lg">{displayAmount}</span>
                </div>

                {/* Amount Options */}
                <div className="grid grid-cols-4 gap-2">
                  {amountOptions.map((option) => {
                    const isSelected = selectedAmount === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedAmount(option.value)
                          if (option.value !== 'custom') {
                            setCustomAmount('')
                          }
                        }}
                        className={`relative px-3 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${isSelected
                            ? 'bg-white dark:bg-[#2a2a2a] border-2 border-[#EB590E] dark:border-[#D94F0C] text-[#EB590E] dark:text-[#EB590E]'
                            : 'bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                      >
                        {option.label}
                        {option.popular && (
                          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#EB590E] dark:bg-[#D94F0C] text-white text-[10px] px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                            POPULAR
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Custom Amount Input */}
                {selectedAmount === 'custom' && (
                  <div className="pt-3">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-semibold text-lg">₹</span>
                      <Input
                        type="number"
                        placeholder="Enter amount (Min ₹100)"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className="pl-10 h-14 text-lg border-gray-200 dark:border-gray-700 focus:border-[#EB590E] dark:focus:border-[#D94F0C] w-full focus:ring-[#EB590E] dark:focus:ring-[#D94F0C] rounded-xl bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        min="100"
                        max="50000"
                      />
                    </div>
                  </div>
                )}

                {/* Redeem Link */}
                <div className="flex items-center gap-1 pt-1">
                  <span className="text-gray-600 dark:text-gray-400 text-sm">Do you have a gift card?</span>
                  <Link to="/user/gift-card/redeem" className="text-[#EB590E] dark:text-[#EB590E] text-sm font-medium underline underline-offset-2 decoration-dashed hover:text-[#D94F0C] dark:hover:text-[#D94F0C]">
                    Redeem now
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Add Message Section */}
          <section className="space-y-4">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
              ADD MESSAGE (OPTIONAL)
            </h3>

            <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
              <CardContent className="p-4">
                <Textarea
                  placeholder="Write a personal message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[120px] border w-full border-gray-200 dark:border-gray-700 rounded-xl p-4 resize-none focus-visible:ring-1 focus-visible:ring-[#EB590E] dark:focus-visible:ring-[#D94F0C] focus:border-[#EB590E] dark:focus:border-[#D94F0C] text-gray-700 dark:text-white text-base bg-white dark:bg-[#2a2a2a] placeholder:text-gray-500 dark:placeholder:text-gray-400"
                  maxLength={200}
                />
                <p className="text-right text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {message.length}/200
                </p>
              </CardContent>
            </Card>
          </section>

          {/* For Bulk Purchases Section */}
          <section className="space-y-4">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
              FOR BULK PURCHASES
            </h3>

            <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-gray-50/50 dark:bg-gray-900/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#EB590E] dark:bg-[#D94F0C] mt-2 flex-shrink-0" />
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Write to us at <span className="font-semibold text-gray-900 dark:text-white">giftcards@appzeto.com</span>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#EB590E] dark:bg-[#D94F0C] mt-2 flex-shrink-0" />
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    For corporate purchases, an invoice in the name of the company will be provided
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#EB590E] dark:bg-[#D94F0C] mt-2 flex-shrink-0" />
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Gift cards will be shared within 2 working days, after receiving the payment
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Purchase History Section */}
          <section className="space-y-4">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
              YOUR PURCHASE HISTORY
            </h3>

            {/* Empty State */}
            <div className="flex flex-col items-center py-8">
              {/* Placeholder Cards Animation */}
              <div className="space-y-3 mb-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 w-64"
                    style={{
                      opacity: 0.4 + (i * 0.2)
                    }}
                  >
                    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                You haven't purchased any gift cards yet
              </p>
            </div>
          </section>
        </div>

        {/* Fixed Bottom Continue Button */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-100 dark:border-gray-800 p-4 shadow-lg">
          <Button
            className="w-full h-14 bg-[#EB590E] dark:bg-[#EB590E] hover:bg-[#D94F0C] dark:hover:bg-[#D94F0C] text-white font-semibold text-base rounded-xl transition-all duration-200"
            onClick={() => {
              const finalAmount = selectedAmount === 'custom' ? Number(customAmount) : selectedAmount
              if (!finalAmount || finalAmount < 100) {
                alert('Please select or enter a valid amount (Min ₹100)')
                return
              }
              navigate('/user/gift-card/checkout', {
                state: {
                  category: currentCategory,
                  amount: finalAmount,
                  message: message
                }
              })
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

