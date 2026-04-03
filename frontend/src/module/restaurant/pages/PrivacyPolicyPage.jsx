import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft } from "lucide-react"

import BottomNavbar from "../components/BottomNavbar"
import MenuOverlay from "../components/MenuOverlay"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import {
  SUPPORT_EMAIL,
  SUPPORT_OWNER_NAME,
  SUPPORT_PHONE,
} from "@/lib/constants/support"

const sections = [
  {
    title: "1. Information we collect",
    bullets: [
      "Restaurant profile data such as outlet name, owner details, address, menus, and operating hours.",
      "Transaction and payout information needed to process orders and settlements.",
      "Usage and device information that helps us maintain service quality and platform security.",
    ],
  },
  {
    title: "2. How we use information",
    bullets: [
      "To operate your outlet listing, process orders, manage settlements, and provide support.",
      "To communicate important updates about your account, payouts, reviews, and compliance requirements.",
      "To detect misuse, investigate disputes, and improve product performance.",
    ],
  },
  {
    title: "3. Information sharing",
    body:
      "We may share limited information with service providers, payment processors, logistics partners, or authorities where reasonably necessary to operate the service, meet legal obligations, or protect platform safety.",
  },
  {
    title: "4. Data retention",
    body:
      "We keep information for as long as it is reasonably required for business operations, legal compliance, payment records, dispute handling, and fraud prevention.",
  },
  {
    title: "5. Your responsibilities",
    body:
      "Please ensure the personal and business information you provide is accurate and updated. Inaccurate details may delay onboarding, payouts, or support resolution.",
  },
  {
    title: "6. Security",
    body:
      "We use reasonable operational and technical safeguards to protect stored information, but no system can guarantee absolute security.",
  },
]

export default function PrivacyPolicyPage() {
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
        <h1 className="text-lg font-bold text-gray-900 flex-1">Privacy Policy</h1>
      </div>

      <div className="px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6"
        >
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-900">Restaurant Partner Privacy Policy</h2>
            <p className="text-sm text-gray-600">
              This policy explains how {companyName} handles restaurant-partner data used across onboarding, account operations, orders, and settlements.
            </p>
          </div>

          <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
            {sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{section.title}</h3>
                {section.body ? <p>{section.body}</p> : null}
                {section.bullets ? (
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">7. Contact us</h3>
              <p>If you have privacy or account-related questions, contact:</p>
              <p className="mt-3">
                <strong>Owner:</strong> {SUPPORT_OWNER_NAME}
                <br />
                <strong>Email:</strong> {SUPPORT_EMAIL}
                <br />
                <strong>Phone:</strong> {SUPPORT_PHONE}
              </p>
            </section>
          </div>
        </motion.div>
      </div>

      <BottomNavbar onMenuClick={() => setShowMenu(true)} />
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}
