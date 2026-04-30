import { useState, useEffect } from "react"
import { Save, Loader2, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const debugError = (...args) => {}

export default function FeeSettings() {
  const normalizeFeeSettings = (settings = {}) => ({
    deliveryFee: settings.deliveryFee ?? 25,
    deliveryBaseDistanceKm: settings.deliveryBaseDistanceKm ?? 2.5,
    deliveryFeePerKm: settings.deliveryFeePerKm ?? 6,
    platformFee: settings.platformFee ?? 5,
    gstRate: settings.gstRate ?? 5,
  })

  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    deliveryBaseDistanceKm: 2.5,
    deliveryFeePerKm: 6,
    platformFee: 5,
    gstRate: 5,
  })
  const [loadingFeeSettings, setLoadingFeeSettings] = useState(false)
  const [savingFeeSettings, setSavingFeeSettings] = useState(false)

  const fetchFeeSettings = async () => {
    try {
      setLoadingFeeSettings(true)
      const response = await adminAPI.getFeeSettings()
      if (response.data.success && response.data.data.feeSettings) {
        setFeeSettings(normalizeFeeSettings(response.data.data.feeSettings))
      }
    } catch (error) {
      debugError('Error fetching fee settings:', error)
      toast.error('Failed to load fee settings')
    } finally {
      setLoadingFeeSettings(false)
    }
  }

  useEffect(() => {
    fetchFeeSettings()
  }, [])

  const handleSaveFeeSettings = async () => {
    try {
      setSavingFeeSettings(true)
      const response = await adminAPI.createOrUpdateFeeSettings({
        deliveryFee: Number(feeSettings.deliveryFee),
        deliveryBaseDistanceKm: Number(feeSettings.deliveryBaseDistanceKm),
        deliveryFeePerKm: Number(feeSettings.deliveryFeePerKm),
        platformFee: Number(feeSettings.platformFee),
        gstRate: Number(feeSettings.gstRate),
        isActive: true,
      })

      if (response.data.success) {
        toast.success('Fee settings saved successfully')
        fetchFeeSettings()
      } else {
        toast.error(response.data.message || 'Failed to save fee settings')
      }
    } catch (error) {
      debugError('Error saving fee settings:', error)
      toast.error(error.response?.data?.message || 'Failed to save fee settings')
    } finally {
      setSavingFeeSettings(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Delivery & Platform Fee</h1>
        </div>
        <p className="text-sm text-slate-600">
          Configure delivery fee, platform fee, and GST settings for orders
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Fee Configuration</h2>
              <p className="text-sm text-slate-500 mt-1">
                Set the fees and charges that will be applied to all orders
              </p>
            </div>
            <Button
              onClick={handleSaveFeeSettings}
              disabled={savingFeeSettings || loadingFeeSettings}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              {savingFeeSettings ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {loadingFeeSettings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Delivery Charges Calculation</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Up to 2.5 KM uses a fixed charge. Beyond that, the fixed charge plus extra per-KM fee is applied.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Distance-based delivery charges</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fixed Charge up to 2.5 KM</label>
                      <select
                        value={feeSettings.deliveryFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, deliveryFee: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      >
                        {[15, 20, 25].map((amount) => (
                          <option key={amount} value={amount}>
                            ₹{amount}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Base Distance (KM)</label>
                      <input
                        type="number"
                        value={feeSettings.deliveryBaseDistanceKm}
                        onChange={(e) => setFeeSettings({ ...feeSettings, deliveryBaseDistanceKm: e.target.value })}
                        min="0"
                        step="0.1"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                        placeholder="2.5"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Additional Fee per KM (₹)</label>
                      <input
                        type="number"
                        value={feeSettings.deliveryFeePerKm}
                        onChange={(e) => setFeeSettings({ ...feeSettings, deliveryFeePerKm: e.target.value })}
                        min="0"
                        step="1"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                        placeholder="6"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                    Formula: ₹{Number(feeSettings.deliveryFee || 0)} up to {Number(feeSettings.deliveryBaseDistanceKm || 0).toFixed(1)} KM, then + ₹{Number(feeSettings.deliveryFeePerKm || 0)} per extra KM
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 pt-6 mt-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Platform Fee (₹)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.platformFee}
                    onChange={(e) => setFeeSettings({ ...feeSettings, platformFee: e.target.value })}
                    min="0"
                    step="1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    placeholder="5"
                  />
                  <p className="text-xs text-slate-500">
                    Platform service fee per order
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    GST Rate (%)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.gstRate}
                    onChange={(e) => setFeeSettings({ ...feeSettings, gstRate: e.target.value })}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    placeholder="5"
                  />
                  <p className="text-xs text-slate-500">
                    GST percentage applied on order subtotal
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
