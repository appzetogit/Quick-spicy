import { ArrowLeft, AlertTriangle } from "lucide-react"
import { useNavigate } from "react-router-dom"

export default function CustomerTipsBalancePage() {

  const navigate = useNavigate()

  return (
    <div className="min-h-screen  bg-white text-black">

      {/* Top Bar */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <ArrowLeft onClick={()=> navigate(-1)} size={22} className="cursor-pointer" />
        <h1 className="text-lg font-semibold">Customer tips</h1>
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-400 p-4 flex items-start gap-3 text-black">
        <AlertTriangle size={20} />
        <div className="text-sm leading-tight">
          <p className="font-semibold">Withdraw currently disabled</p>
          <p className="text-xs">Withdrawable amount is ₹0</p>
        </div>
      </div>

      {/* Withdraw Section */}
      <div className="px-5 py-6 flex flex-col items-start">
        <p className="text-sm text-gray-600 mb-1">Customer tips balance</p>
        <p className="text-4xl font-bold mb-5">₹0</p>

        <button
          disabled
          className="w-full bg-gray-200 text-gray-500 font-medium py-3 rounded-lg cursor-not-allowed"
        >
          Withdraw
        </button>
      </div>

      {/* Section Header */}
      <div className=" bg-gray-100 py-2 pt-4 text-center text-xs font-semibold text-gray-600">
        TIPS DETAILS • 8 DEC – 14 DEC
      </div>

      {/* Detail Rows */}
      <div className="px-4 pt-2">
        <DetailRow label="Tips" value="₹0" />
        <DetailRow label="Tips Withdrawn" value="₹0" />
        <DetailRow label="Withdrawable Amount" value="₹0" />
      </div>


        {/* 100% TIP TRANSFER GUARANTEE Card */}
        <div className="bg-gray-50  rounded-xl p-2 shadow-sm border border-gray-50 fixed bottom-0 w-[90%] mx-auto left-1/2 transform -translate-x-1/2 mb-4">
  {/* Icon + Label */}
  <div className="flex items-center gap-2 mb-2">
    {/* Circular Icon */}
    <div className="relative shrink-0 scale-75">
      <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
        {/* Outer circle */}
        <circle cx="40" cy="40" r="38" fill="white" stroke="#9ca3af" strokeWidth="2"/>
        {/* Checkmark */}
        <path d="M 25 40 L 35 50 L 55 30" stroke="#9ca3af" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Circular text path */}
        <defs>
          <path id="tipCircle" d="M 40,40 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0" fill="none"/>
        </defs>
        <text fill="#9ca3af" fontSize="7" fontWeight="600" letterSpacing="0.5">
          <textPath href="#tipCircle" startOffset="0%">
            100% TIP TRANSFER
          </textPath>
        </text>
      </svg>
    </div>

    {/* Heading */}
    <div className="flex-1">
      <h2 className="text-sm md:text-md font-semibold text-gray-400 truncate">
        100% TIP TRANSFER GUARANTEE
      </h2>
    </div>
  </div>

  {/* Dotted Separator */}
  <div className="border-t border-dashed border-gray-400 mb-4"></div>

  {/* Bullet Points */}
  <div className="space-y-3">
    <div className="flex items-start gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
      <p className="text-gray-400 text-sm md:text-base">
        Tips are never used to settle your deductions.
      </p>
    </div>
    <div className="flex items-start gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
      <p className="text-gray-400 text-sm md:text-base">
        Tips are transferred to your bank account weekly, if not withdrawn.
      </p>
    </div>
  </div>
</div>

    </div>
  )
}

/* Reusable row component */
function DetailRow({ label, value, multiline = false }) {
  return (
    <div className="py-3 flex justify-between items-start border-b border-gray-100">
      <div className={`text-sm ${multiline ? "" : "font-medium"} text-gray-800`}>
        {label}
      </div>
      <div className="text-sm font-semibold text-black">{value}</div>
    </div>
  )
}
