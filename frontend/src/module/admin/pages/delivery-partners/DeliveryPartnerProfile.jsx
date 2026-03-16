import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Bike, Calendar, CreditCard, ExternalLink, FileCheck, Loader2, Mail, MapPin, Phone, User } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const debugError = () => {}

const formatCurrency = (amount) => {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return "\u20B90.00"
  return `\u20B9${numericAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const formatDate = (value) => {
  if (!value) return "N/A"

  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return "N/A"
  }
}

const getDocumentUrl = (document) => {
  if (!document) return ""
  if (typeof document === "string") return document
  return document.url || document.secure_url || ""
}

const renderInfoCard = (label, value) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900">{value || "N/A"}</p>
  </div>
)

export default function DeliveryPartnerProfile() {
  const { id } = useParams()
  const [deliveryPartner, setDeliveryPartner] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDeliveryPartner = async () => {
      if (!id) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await adminAPI.getDeliveryPartnerById(id)

        if (response?.data?.success && response?.data?.data?.delivery) {
          setDeliveryPartner(response.data.data.delivery)
        } else {
          setDeliveryPartner(null)
          toast.error(response?.data?.message || "Failed to load delivery partner")
        }
      } catch (error) {
        debugError("Error fetching delivery partner profile:", error)
        setDeliveryPartner(null)
        toast.error(error?.response?.data?.message || "Failed to load delivery partner")
      } finally {
        setLoading(false)
      }
    }

    fetchDeliveryPartner()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="mx-auto flex max-w-5xl items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-slate-600">Loading delivery partner profile...</span>
        </div>
      </div>
    )
  }

  if (!deliveryPartner) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <Link
            to="/admin/delivery-partners"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to delivery partners
          </Link>
          <p className="mt-6 text-base font-semibold text-slate-900">Delivery partner not found.</p>
        </div>
      </div>
    )
  }

  const profileImageUrl =
    deliveryPartner.profileImage?.url || deliveryPartner.profileImage || ""
  const statusTone =
    deliveryPartner.status === "pending"
      ? "bg-blue-100 text-blue-700"
      : deliveryPartner.status === "approved" || deliveryPartner.status === "active"
        ? "bg-green-100 text-green-700"
        : deliveryPartner.status === "blocked"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-700"

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Link
            to="/admin/delivery-partners"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to delivery partners
          </Link>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
            <div className="shrink-0">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={deliveryPartner.name || "Delivery partner"}
                  className="h-24 w-24 rounded-full border-2 border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200">
                  <User className="h-12 w-12 text-slate-400" />
                </div>
              )}
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                  <User className="h-3 w-3" /> Name
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">{deliveryPartner.name || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Delivery ID</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{deliveryPartner.deliveryId || "N/A"}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                  <Mail className="h-3 w-3" /> Email
                </p>
                <p className="mt-1 text-sm text-slate-900">{deliveryPartner.email || "N/A"}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                  <Phone className="h-3 w-3" /> Phone
                </p>
                <p className="mt-1 text-sm text-slate-900">{deliveryPartner.phone || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
                  {deliveryPartner.status === "blocked"
                    ? "Rejected"
                    : deliveryPartner.status
                      ? deliveryPartner.status.charAt(0).toUpperCase() + deliveryPartner.status.slice(1)
                      : "N/A"}
                </span>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                  <Calendar className="h-3 w-3" /> Date of Birth
                </p>
                <p className="mt-1 text-sm text-slate-900">{formatDate(deliveryPartner.dateOfBirth)}</p>
              </div>
            </div>
          </div>

          {deliveryPartner.rejectionReason ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase text-red-600">Rejection Reason</p>
              <p className="mt-2 text-sm text-red-700">{deliveryPartner.rejectionReason}</p>
            </div>
          ) : null}
        </div>

        {deliveryPartner.location ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <MapPin className="h-4 w-4" />
              Location Details
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {renderInfoCard("Address Line 1", deliveryPartner.location.addressLine1)}
              {renderInfoCard("Address Line 2", deliveryPartner.location.addressLine2)}
              {renderInfoCard("Area", deliveryPartner.location.area)}
              {renderInfoCard("City", deliveryPartner.location.city)}
              {renderInfoCard("State", deliveryPartner.location.state)}
              {renderInfoCard("Zip Code", deliveryPartner.location.zipCode)}
            </div>
          </div>
        ) : null}

        {deliveryPartner.vehicle ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Bike className="h-4 w-4" />
              Vehicle Details
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {renderInfoCard("Brand", deliveryPartner.vehicle.brand)}
              {renderInfoCard("Model", deliveryPartner.vehicle.model)}
              {renderInfoCard("Vehicle Number", deliveryPartner.vehicle.number)}
              {renderInfoCard("Vehicle Type", deliveryPartner.vehicle.type)}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CreditCard className="h-4 w-4" />
            Wallet Summary
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {renderInfoCard("Pocket Balance", formatCurrency(deliveryPartner.walletSummary?.pocketBalance))}
            {renderInfoCard("Cash In Hand", formatCurrency(deliveryPartner.walletSummary?.cashCollected))}
            {renderInfoCard("Remaining Cash Limit", formatCurrency(deliveryPartner.walletSummary?.remainingCashLimit))}
            {renderInfoCard("Total Earning", formatCurrency(deliveryPartner.walletSummary?.totalEarning))}
            {renderInfoCard("Bonus", formatCurrency(deliveryPartner.walletSummary?.bonus))}
            {renderInfoCard("Total Withdrawn", formatCurrency(deliveryPartner.walletSummary?.totalWithdrawn))}
          </div>
        </div>

        {deliveryPartner.documents ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <FileCheck className="h-4 w-4" />
              Documents
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(deliveryPartner.documents).map(([key, value]) => {
                const documentUrl = getDocumentUrl(value?.document || value)
                const documentNumber = value?.number || ""

                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</p>
                    {documentNumber ? (
                      <p className="mt-2 text-sm text-slate-700">Number: {documentNumber}</p>
                    ) : null}
                    {documentUrl ? (
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View document
                      </a>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No document uploaded</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
