import { Link } from "react-router-dom"
import { ArrowLeft, Crown, Percent, Check } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function RedeemGoldCoupon() {
  const companyName = useCompanyName()
  const [couponCode, setCouponCode] = useState("")
  const [isRedeemed, setIsRedeemed] = useState(false)

  const handleRedeem = () => {
    if (couponCode.trim()) {
      setIsRedeemed(true)
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/user/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-black">Redeem Gold coupon</h1>
        </div>

        {!isRedeemed ? (
          <>
            {/* Gold Banner */}
            <Card className="bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl shadow-md mb-6 border-0 overflow-hidden">
              <CardContent className="p-6 text-center">
                <div className="flex justify-center mb-4">
                  <div className="bg-white/20 rounded-full p-4">
                    <Crown className="h-10 w-10 text-white" fill="currentColor" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{companyName} Gold</h2>
                <p className="text-white/90 text-sm">
                  Unlock exclusive deals and offers with your Gold membership
                </p>
              </CardContent>
            </Card>

            {/* Coupon Code Input */}
            <Card className="bg-white rounded-xl shadow-sm border-0 mb-4">
              <CardContent className="p-4">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Enter coupon code
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleRedeem}
                    disabled={!couponCode.trim()}
                    className="bg-[#EB590E] hover:bg-[#D94F0C] text-white"
                  >
                    Redeem
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-gray-100 rounded-full p-2 mt-0.5">
                    <Percent className="h-5 w-5 text-gray-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      How to get Gold coupons?
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Gold coupons are available through special promotions, referrals, and membership benefits. Keep an eye on your notifications for exclusive offers!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Success State */
          <Card className="bg-white rounded-2xl shadow-md border-0 overflow-hidden">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Coupon Redeemed!</h2>
              <p className="text-gray-600 mb-6">
                Your Gold coupon has been successfully redeemed. Enjoy your exclusive benefits!
              </p>
              <Button
                onClick={() => {
                  setIsRedeemed(false)
                  setCouponCode("")
                }}
                className="bg-[#EB590E] hover:bg-[#D94F0C] text-white"
              >
                Redeem Another
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AnimatedPage>
  )
}

