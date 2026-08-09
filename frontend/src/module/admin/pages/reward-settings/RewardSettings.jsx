import { useState, useEffect } from "react"
import { Save, Loader2, Gift, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const RUPEE = "₹"

export default function RewardSettings() {
  const [settings, setSettings] = useState({
    signupBonusAmount: 20,
    referralRewardAmount: 50,
    referralMinOrderAmount: 299,
    signupBonusEnabled: true,
    referralRewardEnabled: true,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getRewardSettings()
      const loaded = response?.data?.data?.settings
      if (loaded) setSettings((prev) => ({ ...prev, ...loaded }))
    } catch {
      toast.error("Failed to load reward settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async () => {
    // Blank or negative here would be money, so it is stopped before the request rather
    // than relying on the server message to explain it.
    const numbers = ["signupBonusAmount", "referralRewardAmount", "referralMinOrderAmount"]
    for (const field of numbers) {
      const value = Number(settings[field])
      if (settings[field] === "" || !Number.isFinite(value) || value < 0) {
        toast.error("Every amount must be a number of 0 or more")
        return
      }
    }

    try {
      setSaving(true)
      const response = await adminAPI.updateRewardSettings({
        signupBonusAmount: Number(settings.signupBonusAmount),
        referralRewardAmount: Number(settings.referralRewardAmount),
        referralMinOrderAmount: Number(settings.referralMinOrderAmount),
        signupBonusEnabled: Boolean(settings.signupBonusEnabled),
        referralRewardEnabled: Boolean(settings.referralRewardEnabled),
      })
      if (response?.data?.success) {
        toast.success("Reward settings saved - live immediately")
        fetchSettings()
      } else {
        toast.error(response?.data?.message || "Failed to save")
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save reward settings")
    } finally {
      setSaving(false)
    }
  }

  const field = (key) => ({
    value: settings[key],
    onChange: (e) => setSettings((prev) => ({ ...prev, [key]: e.target.value })),
    type: "number",
    min: "0",
    className:
      "w-full h-12 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] px-4 text-base text-black dark:text-white",
  })

  const toggle = (key, label) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={Boolean(settings[key])}
        onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.checked }))}
        className="h-4 w-4 accent-[#EB590E]"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  )

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-black dark:text-white">Reward Settings</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          What the platform pays out for signups and referrals. Changes apply immediately, to
          new payouts only - wallets already credited are not affected.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141414] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="h-5 w-5 text-[#EB590E]" />
              <h2 className="font-bold text-lg text-black dark:text-white">First-time signup bonus</h2>
            </div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Amount credited to a new customer ({RUPEE})
            </label>
            <input {...field("signupBonusAmount")} />
            <p className="text-xs text-gray-500 mt-2 mb-3">
              Paid once, when the customer first verifies their phone number.
            </p>
            {toggle("signupBonusEnabled", "Signup bonus enabled")}
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141414] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-[#EB590E]" />
              <h2 className="font-bold text-lg text-black dark:text-white">Referral cashback</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Reward to the referrer ({RUPEE})
                </label>
                <input {...field("referralRewardAmount")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Minimum order to qualify ({RUPEE})
                </label>
                <input {...field("referralMinOrderAmount")} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 mb-3">
              The referrer is paid only after the referred customer&apos;s first delivered order
              reaches the minimum, once per referred customer. The minimum is checked against the
              food subtotal, so a tip cannot push a small order over the line.
            </p>
            {toggle("referralRewardEnabled", "Referral reward enabled")}
          </section>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-12 px-6 bg-[#EB590E] hover:bg-[#D94F0C] text-white font-bold rounded-lg"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          <p className="text-xs text-gray-500">Only a super admin can save changes here.</p>
        </div>
      )}
    </div>
  )
}
