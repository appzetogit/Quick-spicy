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
    title: "1. Platform use",
    body:
      "These terms govern your use of the restaurant partner panel, related applications, and connected services used to manage your outlet on the platform.",
  },
  {
    title: "2. Account responsibilities",
    bullets: [
      "Keep your restaurant, owner, banking, and contact information accurate and updated.",
      "Protect your login credentials and restrict panel access to authorized staff only.",
      "You are responsible for actions taken through your account and linked devices.",
    ],
  },
  {
    title: "3. Listings and operations",
    bullets: [
      "Menus, prices, taxes, offers, and availability shown in the app must remain accurate.",
      "You are responsible for food quality, hygiene, packaging, and compliance with local regulations.",
      "Orders should be processed within the operational timing committed on the platform.",
    ],
  },
  {
    title: "4. Payouts and deductions",
    body:
      "Payouts may reflect commissions, refunds, cancellations, promotional adjustments, penalties for policy violations, or other applicable deductions communicated by the platform.",
  },
  {
    title: "5. Restricted conduct",
    bullets: [
      "Posting misleading information, fake discounts, or unavailable items.",
      "Attempting fraudulent transactions, order manipulation, or misuse of customer data.",
      "Using the platform in any way that harms customers, delivery partners, or platform operations.",
    ],
  },
  {
    title: "6. Suspension and termination",
    body:
      "Accounts may be restricted, suspended, or removed if policies are violated, mandatory documents are invalid, or the platform reasonably believes there is fraud, misuse, or legal risk.",
  },
  {
    title: "7. Changes to terms",
    body:
      "We may revise these terms from time to time. Continued use of the restaurant panel after such updates means you accept the revised terms.",
  },
]

export default function TermsAndConditionsPage() {
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
        <h1 className="text-lg font-bold text-gray-900 flex-1">Terms & Conditions</h1>
      </div>

      <div className="px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6"
        >
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-900">Restaurant Partner Terms</h2>
            <p className="text-sm text-gray-600">
              These terms explain the key expectations and responsibilities when you use the {companyName} restaurant partner platform.
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
              <h3 className="text-lg font-semibold text-gray-900 mb-3">8. Contact for legal and support matters</h3>
              <p>If you have questions about these terms, contact:</p>
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
