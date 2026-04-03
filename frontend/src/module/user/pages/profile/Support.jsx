import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Headset,
  Mail,
  Phone,
  Clock3,
  MessageSquareText,
} from "lucide-react"

import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  const companyName = useCompanyName()

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-amber-50 dark:from-[#0a0a0a] dark:via-[#111111] dark:to-[#1a120c]">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
          <Link to="/user/profile">
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10 p-0 hover:bg-orange-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-900 dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">Support</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <Card className="bg-white/95 dark:bg-[#171717] border-0 dark:border-gray-800 shadow-lg rounded-2xl overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-[#EB590E] via-orange-500 to-amber-500 p-6 md:p-8 text-white">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4">
                <Headset className="h-7 w-7" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">We are here to help</h2>
              <p className="text-sm md:text-base text-white/90 max-w-2xl leading-relaxed">
                Reach out to the {companyName} support team for help with orders, payments, account issues, or any general assistance.
              </p>
            </div>

            <CardContent className="p-5 md:p-6 lg:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
                <div className="rounded-2xl border border-orange-100 dark:border-gray-800 bg-orange-50/70 dark:bg-[#1f1f1f] p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-white dark:bg-[#2a2a2a] p-3 shadow-sm">
                        <Headset className="h-5 w-5 text-[#EB590E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Owner</p>
                      <p className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                        {SUPPORT_OWNER_NAME}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        For any assistance, you can reach out using the support contacts below.
                      </p>
                    </div>
                  </div>
                </div>

                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="group rounded-2xl border border-orange-100 dark:border-gray-800 bg-orange-50/70 dark:bg-[#1f1f1f] p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-white dark:bg-[#2a2a2a] p-3 shadow-sm">
                      <Mail className="h-5 w-5 text-[#EB590E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Email support</p>
                      <p className="text-base md:text-lg font-semibold text-gray-900 dark:text-white break-all">
                        {SUPPORT_EMAIL}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Best for detailed queries, order follow-ups, and account assistance.
                      </p>
                    </div>
                  </div>
                </a>

                <a
                  href={`tel:${SUPPORT_PHONE_HREF}`}
                  className="group rounded-2xl border border-orange-100 dark:border-gray-800 bg-orange-50/70 dark:bg-[#1f1f1f] p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-white dark:bg-[#2a2a2a] p-3 shadow-sm">
                      <Phone className="h-5 w-5 text-[#EB590E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Call support</p>
                      <p className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                        {SUPPORT_PHONE}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Reach us directly if you need urgent help with an active issue.
                      </p>
                    </div>
                  </div>
                </a>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-4 md:gap-6">
                <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#121212] shadow-none rounded-2xl">
                  <CardContent className="p-5 md:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="rounded-xl bg-orange-100 dark:bg-orange-900/20 p-2.5">
                        <MessageSquareText className="h-5 w-5 text-[#EB590E]" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">What we can help with</h3>
                    </div>

                    <div className="space-y-3">
                      {SUPPORT_TOPICS.map((topic) => (
                        <div
                          key={topic}
                          className="flex items-start gap-3 rounded-xl bg-gray-50 dark:bg-[#1b1b1b] px-4 py-3"
                        >
                          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#EB590E]" />
                          <p className="text-sm md:text-base text-gray-700 dark:text-gray-300">{topic}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#121212] shadow-none rounded-2xl">
                  <CardContent className="p-5 md:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="rounded-xl bg-orange-100 dark:bg-orange-900/20 p-2.5">
                        <Clock3 className="h-5 w-5 text-[#EB590E]" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Helpful note</h3>
                    </div>

                    <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                      {SUPPORT_NOTE}
                    </p>

                    <Link
                      to="/user/orders"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#EB590E] hover:text-orange-600 transition-colors"
                    >
                      View your orders
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AnimatedPage>
  )
}
