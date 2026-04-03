import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import {
  ArrowLeft,
  Headset,
  Mail,
  Phone,
  MessageSquareText,
  Clock3,
} from "lucide-react"

import BottomNavbar from "../components/BottomNavbar"
import MenuOverlay from "../components/MenuOverlay"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import {
  SUPPORT_EMAIL,
  SUPPORT_NOTE,
  SUPPORT_OWNER_NAME,
  SUPPORT_PHONE,
  SUPPORT_PHONE_HREF,
  SUPPORT_TOPICS,
} from "@/lib/constants/support"

export default function SupportPage() {
  const navigate = useNavigate()
  const companyName = useCompanyName()
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24 md:pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Support</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-2xl shadow-sm"
        >
          <div className="bg-gradient-to-r from-[#ff8100] to-[#ff9a1f] px-6 py-7 text-white">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
              <Headset className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Restaurant partner support</h2>
            <p className="text-sm text-white/90 leading-relaxed max-w-2xl">
              Reach out to the {companyName} team if you need help with account access, payouts, menu updates, onboarding, or any operational issue.
            </p>
          </div>

          <div className="bg-white p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2.5 shadow-sm">
                    <Headset className="w-5 h-5 text-[#ff8100]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Owner</p>
                    <p className="text-lg font-semibold text-gray-900">{SUPPORT_OWNER_NAME}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Primary contact for assistance related to the platform and account support.
                    </p>
                  </div>
                </div>
              </div>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="rounded-xl border border-orange-100 bg-orange-50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2.5 shadow-sm">
                    <Mail className="w-5 h-5 text-[#ff8100]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Email support</p>
                    <p className="text-base font-semibold text-gray-900 break-all">{SUPPORT_EMAIL}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Best for onboarding questions, legal requests, and account-related follow-ups.
                    </p>
                  </div>
                </div>
              </a>

              <a
                href={`tel:${SUPPORT_PHONE_HREF}`}
                className="rounded-xl border border-orange-100 bg-orange-50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2.5 shadow-sm">
                    <Phone className="w-5 h-5 text-[#ff8100]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Call support</p>
                    <p className="text-base font-semibold text-gray-900">{SUPPORT_PHONE}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Use this for urgent operational issues that need immediate attention.
                    </p>
                  </div>
                </div>
              </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.95fr] gap-4">
              <div className="rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-xl bg-orange-100 p-2.5">
                    <MessageSquareText className="w-5 h-5 text-[#ff8100]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">What we can help with</h3>
                </div>
                <div className="space-y-3">
                  {SUPPORT_TOPICS.map((topic) => (
                    <div key={topic} className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#ff8100]" />
                      <p className="text-sm text-gray-700">{topic}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-xl bg-orange-100 p-2.5">
                    <Clock3 className="w-5 h-5 text-[#ff8100]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Helpful note</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {SUPPORT_NOTE}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <BottomNavbar onMenuClick={() => setShowMenu(true)} />
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}
