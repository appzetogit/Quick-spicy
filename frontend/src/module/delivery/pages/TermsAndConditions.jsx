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
    title: "1. Delivery partner access",
    body:
      "These terms apply when you use the delivery partner application, account tools, and related platform services.",
  },
  {
    title: "2. Account obligations",
    bullets: [
      "Keep your profile, vehicle, banking, and document information accurate.",
      "Do not share your account access with unauthorized persons.",
      "You are responsible for activities that happen through your account and device sessions.",
    ],
  },
  {
    title: "3. Service expectations",
    bullets: [
      "Handle pickups and deliveries professionally and in accordance with platform instructions.",
      "Maintain respectful behaviour toward customers, restaurants, and support teams.",
      "Comply with road safety, local law, and platform safety rules at all times.",
    ],
  },
  {
    title: "4. Earnings and deductions",
    body:
      "Earnings, bonuses, deductions, tips, cash collections, and settlements may vary based on completed deliveries, platform policies, disputes, refunds, and applicable adjustments.",
  },
  {
    title: "5. Restricted conduct",
    bullets: [
      "Fraudulent activity, fake deliveries, order tampering, or misuse of OTPs or customer data.",
      "Unsafe behaviour, abusive conduct, or repeated non-compliance with platform instructions.",
      "Manipulating location, account status, or payout workflows.",
    ],
  },
  {
    title: "6. Suspension or removal",
    body:
      "Accounts may be limited, suspended, or permanently removed where there is policy violation, fraud risk, unsafe behaviour, or legal/compliance concern.",
  },
]

export default function TermsAndConditions() {
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
        <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Terms and Conditions</h1>
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Delivery Partner Terms</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                These terms explain the basic responsibilities and conditions for using the {companyName} delivery platform.
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">7. Support contact</h3>
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
      </div>
    </div>
  )
}
