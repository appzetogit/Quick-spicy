import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

import { useCompanyName } from "@/lib/hooks/useCompanyName"
import {
  SUPPORT_EMAIL,
  SUPPORT_OWNER_NAME,
  SUPPORT_PHONE,
} from "@/lib/constants/support"

const sections = [
  {
    title: "1. Data we collect",
    bullets: [
      "Profile details such as name, phone number, email, vehicle details, and account identifiers.",
      "Verification data such as uploaded documents, banking details, and onboarding information.",
      "Operational data such as delivery activity, location updates, order events, and support requests.",
    ],
  },
  {
    title: "2. How data is used",
    bullets: [
      "To verify identity, manage deliveries, process earnings and withdrawals, and provide support.",
      "To maintain safety, investigate disputes, detect misuse, and improve platform reliability.",
      "To communicate important service, compliance, and account updates.",
    ],
  },
  {
    title: "3. Limited sharing",
    body:
      "We may share relevant information with payment processors, service providers, platform teams, or authorities where necessary to operate the service, complete settlements, respond to disputes, or comply with the law.",
  },
  {
    title: "4. Security and retention",
    body:
      "We use reasonable safeguards to protect delivery-partner information and retain data for operational, legal, and dispute-resolution purposes as needed.",
  },
  {
    title: "5. Your role",
    body:
      "Please make sure submitted data is accurate and current. Incorrect information may affect payouts, verification, support handling, or continued access to the platform.",
  },
]

export default function PrivacyPolicy() {
  const navigate = useNavigate()
  const companyName = useCompanyName()

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] overflow-x-hidden">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 py-4 md:py-3 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Privacy Policy</h1>
      </div>

      <div className="w-full px-5 py-6 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="rounded-3xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#121212] p-6 md:p-8 space-y-6"
          >
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Delivery Partner Privacy Policy</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This policy explains how {companyName} handles information shared by delivery partners while using the platform.
              </p>
            </div>

            <div className="space-y-6 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {sections.map((section) => (
                <section key={section.title}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{section.title}</h3>
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">6. Contact us</h3>
                <p>If you have privacy-related questions, contact:</p>
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
      </div>
    </div>
  )
}
