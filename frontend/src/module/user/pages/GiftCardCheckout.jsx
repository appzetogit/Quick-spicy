import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

// Social icons for sharing
const socialIcons = [
  { id: 'whatsapp', icon: '💬', bg: 'bg-[#EB590E]' },
  { id: 'facebook', icon: '📘', bg: 'bg-[#EB590E]' },
  { id: 'gpay', icon: '💳', bg: 'bg-[#EB590E]' },
  { id: 'instagram', icon: '📷', bg: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400' },
]

export default function GiftCardCheckout() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()

  // Get data passed from GiftCards page
  const { category, amount, message } = location.state || {
    category: {
      id: 'birthday',
      label: 'Birthday',
      cardTitle: 'HAPPY\nBIRTHDAY',
      bgColor: '#f87171',
      emojis: ['🎂', '🎁', '🥳', '🎉'],
      message: 'Have a yumazing birthday!'
    },
    amount: 2000,
    message: 'Have a yumazing birthday!'
  }

  const formattedAmount = `₹${amount.toLocaleString('en-IN')}`

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Complete purchase</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-5">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Gift Card Preview */}
          <Card className="border-0 py-0 shadow-md overflow-hidden bg-white dark:bg-[#1a1a1a]">
            <CardContent className="p-0">
              {/* Gift Card */}
              <div
                className="relative w-full h-52 sm:h-60 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${category?.bgColor}ee 0%, ${category?.bgColor} 50%, ${category?.bgColor}dd 100%)`
                }}
              >
                {/* Decorative Emojis */}
                <div className="absolute top-4 left-4 text-3xl sm:text-4xl animate-bounce" style={{ animationDelay: '0ms', animationDuration: '2s' }}>
                  {category?.emojis[0]}
                </div>
                <div className="absolute top-4 right-4 text-3xl sm:text-4xl animate-bounce" style={{ animationDelay: '200ms', animationDuration: '2.2s' }}>
                  {category?.emojis[1]}
                </div>
                <div className="absolute bottom-14 left-6 text-3xl sm:text-4xl animate-bounce" style={{ animationDelay: '400ms', animationDuration: '2.4s' }}>
                  {category?.emojis[2]}
                </div>
                <div className="absolute bottom-14 right-6 text-3xl sm:text-4xl animate-bounce" style={{ animationDelay: '600ms', animationDuration: '2.6s' }}>
                  {category?.emojis[3]}
                </div>

                {/* Card Title */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <h2 className="text-white text-3xl sm:text-4xl font-black text-center leading-tight tracking-wide whitespace-pre-line drop-shadow-lg">
                    {category?.cardTitle}
                  </h2>
                  <p className="text-white/80 text-sm mt-3 font-medium">{companyName.toLowerCase()}</p>
                </div>

                {/* Sparkle Effects */}
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-white/60 rounded-full animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-white/50 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              </div>

              {/* Message Below Card */}
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-4">
                <p className="text-gray-700 dark:text-gray-300 text-base text-center font-medium">
                  {message || category?.message}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Gift Card Amount */}
          <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300 font-medium text-base">Gift Card amount</span>
                <span className="text-gray-900 dark:text-white font-bold text-xl">{formattedAmount}</span>
              </div>
            </CardContent>
          </Card>

          {/* Share Section */}
          <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Social Icons */}
                <div className="flex items-center gap-1">
                  {socialIcons.map((social, index) => (
                    <div
                      key={social.id}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${social.bg}`}
                      style={{ marginLeft: index > 0 ? '-6px' : '0', zIndex: socialIcons.length - index }}
                    >
                      {social.icon}
                    </div>
                  ))}
                </div>
                {/* Text */}
                <p className="text-gray-600 dark:text-gray-400 text-sm flex-1">
                  Complete payment and share this e-gift card with your loved ones using any app
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bill Summary */}
          <section className="space-y-3">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
              BILL SUMMARY
            </h3>

            <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
              <CardContent className="p-4 space-y-3">
                {/* Subtotal */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                  <span className="text-gray-900 dark:text-white font-medium">{formattedAmount}</span>
                </div>

                {/* Divider */}
                <div className="border-t border-dashed border-gray-200 dark:border-gray-700" />

                {/* Grand Total */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 dark:text-white font-semibold">Grand Total</span>
                  <span className="text-gray-900 dark:text-white font-bold text-lg">{formattedAmount}</span>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Terms & Conditions */}
          <div className="text-gray-500 dark:text-gray-400 text-sm">
            <p>
              All gift cards are issued by Razorpay and have an expiry of 4 years. Read{' '}
              <button className="text-[#EB590E] font-medium hover:underline">
                T&Cs
              </button>
            </p>
          </div>
        </div>

        {/* Fixed Bottom Payment Button */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-100 dark:border-gray-800 p-4 shadow-lg">
          <Button
            className="w-full h-14 bg-[#EB590E] hover:bg-[#D94F0C] text-white font-semibold text-base rounded-xl transition-all duration-200 flex items-center justify-between px-6"
            onClick={() => {
              // Navigate to payment or show payment options
              navigate('/user/profile/payments/new', {
                state: {
                  returnTo: '/user/gift-card/checkout',
                  giftCard: { category, amount, message }
                }
              })
            }}
          >
            <span>Add Payment Method</span>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

