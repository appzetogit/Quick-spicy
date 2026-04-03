import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Headset,
  Mail,
  Phone,
  MessageSquareText,
  Clock3,
} from "lucide-react"

import { useCompanyName } from "@/lib/hooks/useCompanyName"
import {
  SUPPORT_EMAIL,
  SUPPORT_NOTE,
  SUPPORT_OWNER_NAME,
  SUPPORT_PHONE,
  SUPPORT_PHONE_HREF,
  SUPPORT_TOPICS,
} from "@/lib/constants/support"

export default function Support() {
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
        <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Support</h1>
      </div>

      <div className="w-full px-5 py-6 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm"
          >
            <div className="bg-gradient-to-r from-[#111111] via-[#1d1d1d] to-[#2d2d2d] px-6 py-7 text-white">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
                <Headset className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Delivery partner support</h2>
              <p className="text-sm text-white/85 leading-relaxed max-w-2xl">
                Contact the {companyName} support team for help with your delivery account, payout concerns, verification issues, or general assistance.
              </p>
            </div>

            <div className="bg-white dark:bg-[#121212] p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-[#1b1b1b] p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-white dark:bg-[#262626] p-2.5 shadow-sm">
                      <Headset className="w-5 h-5 text-[#111111] dark:text-white" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Owner</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{SUPPORT_OWNER_NAME}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Reach out through the support contacts below for help with platform issues.
                      </p>
                    </div>
                  </div>
                </div>

                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-[#1b1b1b] p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-white dark:bg-[#262626] p-2.5 shadow-sm">
                      <Mail className="w-5 h-5 text-[#111111] dark:text-white" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Email support</p>
                      <p className="text-base font-semibold text-gray-900 dark:text-white break-all">{SUPPORT_EMAIL}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Best for detailed account, verification, and payout queries.
                      </p>
                    </div>
                  </div>
                </a>

                <a
                  href={`tel:${SUPPORT_PHONE_HREF}`}
                  className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-[#1b1b1b] p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-white dark:bg-[#262626] p-2.5 shadow-sm">
                      <Phone className="w-5 h-5 text-[#111111] dark:text-white" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Call support</p>
                      <p className="text-base font-semibold text-gray-900 dark:text-white">{SUPPORT_PHONE}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Call if you need urgent assistance while handling deliveries or account access issues.
                      </p>
                    </div>
                  </div>
                </a>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.95fr] gap-4">
                <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="rounded-xl bg-gray-100 dark:bg-[#222222] p-2.5">
                      <MessageSquareText className="w-5 h-5 text-gray-900 dark:text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">What we can help with</h3>
                  </div>
                  <div className="space-y-3">
                    {SUPPORT_TOPICS.map((topic) => (
                      <div key={topic} className="flex items-start gap-3 rounded-xl bg-gray-50 dark:bg-[#1b1b1b] px-4 py-3">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-gray-900 dark:bg-white" />
                        <p className="text-sm text-gray-700 dark:text-gray-300">{topic}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="rounded-xl bg-gray-100 dark:bg-[#222222] p-2.5">
                      <Clock3 className="w-5 h-5 text-gray-900 dark:text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Helpful note</h3>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {SUPPORT_NOTE}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
