import React from "react"
import { motion } from "framer-motion"
import { Clock, AlertCircle, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"

const ClosedStatusOverlay = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      {/* Blurred background */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Content Card */}
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl overflow-hidden border border-white/10"
      >
        {/* Decorative Background Element */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl" />

        <div className="relative p-8 text-center space-y-6">
          {/* Icon Container */}
          <div className="mx-auto w-20 h-20 bg-red-50/80 dark:bg-red-500/20 rounded-2xl flex items-center justify-center relative group">
             <div className="absolute inset-0 bg-red-500/10 rounded-2xl animate-ping group-hover:animate-none" />
             <div className="relative">
                <Clock className="w-10 h-10 text-red-600 dark:text-red-400" />
             </div>
          </div>

          {/* Text Content */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Closed for <span className="text-red-600">Eid al-Fitr</span>
            </h1>
            <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
              On the auspicious occasion of Eid al-Fitr, we are taking a break to celebrate. Eid Mubarak to you and your family!
            </p>
          </div>

          {/* Info Pills */}
          <div className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
               <AlertCircle className="w-5 h-5 text-zinc-400" />
               <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Ordering is currently disabled</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
               <UtensilsCrossed className="w-5 h-5 text-zinc-400" />
               <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Check back tomorrow for fresh meals!</span>
            </div>
          </div>

          {/* Action Button - just for aesthetics / close-ish feel if they want it to be dismissible later */}
          {/* But for now, it's just a "Got it" button that doesn't do anything essential since it's a hard closed state */}
          <Button 
            variant="outline" 
            className="w-full h-12 rounded-xl text-md font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all border-zinc-200 dark:border-zinc-700"
            onClick={() => {
                // If the user wants it to be dismissible, they can add logic here.
                // For now, we keep it prominent.
            }}
          >
            Stay Tuned 🔔
          </Button>

          <p className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-bold">
            Quicky Spicy &copy; 2026
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default ClosedStatusOverlay
