import { Routes, Route } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import UserLayout from "./UserLayout"
import { Suspense, lazy } from "react"
import Loader from "@/components/Loader"

// Lazy Loading Pages

// Home & Discovery
const Home = lazy(() => import("../pages/Home"))
const Under250 = lazy(() => import("../pages/Under250"))
const CategoryPage = lazy(() => import("../pages/CategoryPage"))
const Restaurants = lazy(() => import("../pages/restaurants/Restaurants"))
const RestaurantDetails = lazy(() => import("../pages/restaurants/RestaurantDetails"))
const SearchResults = lazy(() => import("../pages/SearchResults"))
const ProductDetail = lazy(() => import("../pages/ProductDetail"))

// Cart
const Cart = lazy(() => import("../pages/cart/Cart"))
const Checkout = lazy(() => import("../pages/cart/Checkout"))

// Orders
const Orders = lazy(() => import("../pages/orders/Orders"))
const OrderTracking = lazy(() => import("../pages/orders/OrderTracking"))
const OrderInvoice = lazy(() => import("../pages/orders/OrderInvoice"))
const UserOrderDetails = lazy(() => import("../pages/orders/UserOrderDetails"))

// Offers
const Offers = lazy(() => import("../pages/Offers"))

// Gourmet
const Gourmet = lazy(() => import("../pages/Gourmet"))

// Top 10
const Top10 = lazy(() => import("../pages/Top10"))

// Collections
const Collections = lazy(() => import("../pages/Collections"))
const CollectionDetail = lazy(() => import("../pages/CollectionDetail"))

// Gift Cards
const GiftCards = lazy(() => import("../pages/GiftCards"))
const GiftCardCheckout = lazy(() => import("../pages/GiftCardCheckout"))

// Profile
const Profile = lazy(() => import("../pages/profile/Profile"))
const EditProfile = lazy(() => import("../pages/profile/EditProfile"))
const Payments = lazy(() => import("../pages/profile/Payments"))
const AddPayment = lazy(() => import("../pages/profile/AddPayment"))
const EditPayment = lazy(() => import("../pages/profile/EditPayment"))
const Favorites = lazy(() => import("../pages/profile/Favorites"))
const Settings = lazy(() => import("../pages/profile/Settings"))
const Coupons = lazy(() => import("../pages/profile/Coupons"))
const RedeemGoldCoupon = lazy(() => import("../pages/profile/RedeemGoldCoupon"))
const About = lazy(() => import("../pages/profile/About"))
const Terms = lazy(() => import("../pages/profile/Terms"))
const Privacy = lazy(() => import("../pages/profile/Privacy"))
const Refund = lazy(() => import("../pages/profile/Refund"))
const Shipping = lazy(() => import("../pages/profile/Shipping"))
const Cancellation = lazy(() => import("../pages/profile/Cancellation"))
const SendFeedback = lazy(() => import("../pages/profile/SendFeedback"))
const ReportSafetyEmergency = lazy(() => import("../pages/profile/ReportSafetyEmergency"))
const Accessibility = lazy(() => import("../pages/profile/Accessibility"))
const Logout = lazy(() => import("../pages/profile/Logout"))

// Auth
const SignIn = lazy(() => import("../pages/auth/SignIn"))
const OTP = lazy(() => import("../pages/auth/OTP"))
const AuthCallback = lazy(() => import("../pages/auth/AuthCallback"))

// Help
const Help = lazy(() => import("../pages/help/Help"))
const OrderHelp = lazy(() => import("../pages/help/OrderHelp"))

// Notifications
const Notifications = lazy(() => import("../pages/Notifications"))

// Wallet
const Wallet = lazy(() => import("../pages/Wallet"))

// Complaints
const SubmitComplaint = lazy(() => import("../pages/complaints/SubmitComplaint"))

export default function UserRouter() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route element={<UserLayout />}>
          {/* Home & Discovery */}
          <Route path="/" element={<Home />} />
          <Route path="/under-250" element={<Under250 />} />
          <Route path="/category/:category" element={<CategoryPage />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/product/:id" element={<ProductDetail />} />

          {/* Cart - Protected */}
          <Route
            path="/cart"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cart/checkout"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Checkout />
              </ProtectedRoute>
            }
          />

          {/* Orders - Protected */}
          <Route
            path="/orders"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <OrderTracking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/invoice"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <OrderInvoice />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/details"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <UserOrderDetails />
              </ProtectedRoute>
            }
          />

          {/* Offers */}
          <Route path="/offers" element={<Offers />} />

          {/* Gourmet */}
          <Route path="/gourmet" element={<Gourmet />} />

          {/* Top 10 */}
          <Route path="/top-10" element={<Top10 />} />

          {/* Collections */}
          <Route path="/collections" element={<Collections />} />
          <Route
            path="/collections/:id"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <CollectionDetail />
              </ProtectedRoute>
            }
          />

          {/* Gift Cards */}
          <Route path="/gift-card" element={<GiftCards />} />
          <Route
            path="/gift-card/checkout"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <GiftCardCheckout />
              </ProtectedRoute>
            }
          />

          {/* Profile - Protected */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <EditProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/payments"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Payments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/payments/new"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <AddPayment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/payments/:id/edit"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <EditPayment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/favorites"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Favorites />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/settings"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/coupons"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Coupons />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/redeem-gold-coupon"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <RedeemGoldCoupon />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/about"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <About />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile/send-feedback"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <SendFeedback />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/report-safety-emergency"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <ReportSafetyEmergency />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/accessibility"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Accessibility />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/logout"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Logout />
              </ProtectedRoute>
            }
          />

          {/* Public Legal Policies */}
          <Route path="/profile/terms" element={<Terms />} />
          <Route path="/profile/privacy" element={<Privacy />} />
          <Route path="/profile/refund" element={<Refund />} />
          <Route path="/profile/shipping" element={<Shipping />} />
          <Route path="/profile/cancellation" element={<Cancellation />} />

          {/* Auth */}
          <Route path="/auth/sign-in" element={<AuthRedirect module="user"><SignIn /></AuthRedirect>} />
          <Route path="/auth/otp" element={<AuthRedirect module="user"><OTP /></AuthRedirect>} />
          <Route path="/auth/callback" element={<AuthRedirect module="user"><AuthCallback /></AuthRedirect>} />

          {/* Help */}
          <Route path="/help" element={<Help />} />
          <Route path="/help/orders/:orderId" element={<OrderHelp />} />

          {/* Notifications - Protected */}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Notifications />
              </ProtectedRoute>
            }
          />

          {/* Wallet - Protected */}
          <Route
            path="/wallet"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Wallet />
              </ProtectedRoute>
            }
          />

          {/* Complaints - Protected */}
          <Route
            path="/complaints/submit/:orderId"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <SubmitComplaint />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}
