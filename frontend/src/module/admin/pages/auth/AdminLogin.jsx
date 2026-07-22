import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI, locationAPI } from "@/lib/api";
import { setAuthData, isModuleAuthenticated } from "@/lib/utils/auth";
import { loadBusinessSettings } from "@/lib/utils/businessSettings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, Loader2, MapPin, ShieldCheck } from "lucide-react";
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png";

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

export default function AdminLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpMeta, setOtpMeta] = useState({ channel: "", maskedTarget: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [error, setError] = useState("");
  const [logoUrl, setLogoUrl] = useState(quickSpicyLogo);
  const [resendTimer, setResendTimer] = useState(0);
  const [sessionContext, setSessionContext] = useState({
    locationPermission: "prompt",
    deviceName: "",
    location: null,
  });
  const otpRefs = useRef(Array(6).fill(null));

  useEffect(() => {
    if (isModuleAuthenticated("admin")) {
      navigate("/admin", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const settings = await loadBusinessSettings();
        if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url);
        }
      } catch (fetchError) {
        debugWarn("Failed to load business settings logo:", fetchError);
      }
    };

    fetchLogo();
  }, []);

  useEffect(() => {
    const userAgent = navigator?.userAgent || "";
    let deviceName = "Admin Browser";

    if (/edg/i.test(userAgent)) deviceName = "Edge Browser";
    else if (/chrome/i.test(userAgent)) deviceName = "Chrome Browser";
    else if (/firefox/i.test(userAgent)) deviceName = "Firefox Browser";
    else if (/safari/i.test(userAgent)) deviceName = "Safari Browser";

    setSessionContext((current) => ({
      ...current,
      deviceName,
    }));
  }, []);

  useEffect(() => {
    if (step !== "otp" || resendTimer <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setResendTimer((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, resendTimer]);

  const requestOtp = async ({ nextStep = "permission" } = {}) => {
    const response = await adminAPI.login(email, password);
    const data = response?.data?.data || response?.data;

    if (!data?.requiresOtp && data?.admin) {
      setAuthData("admin", null, data.admin);
      window.dispatchEvent(new Event("adminAuthChanged"));
      navigate("/admin", { replace: true });
      return { directLogin: true };
    }

    if (!data?.requiresOtp) {
      throw new Error("OTP challenge was not created. Please try again.");
    }

    setOtpMeta({
      channel: data.channel || "",
      maskedTarget: data.maskedTarget || email,
    });
    setStep(nextStep);
    setOtp(["", "", "", "", "", ""]);
    setResendTimer(60);
    if (nextStep === "otp") {
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    }
  };

  const moveToOtpStep = () => {
    setStep("otp");
    setTimeout(() => otpRefs.current[0]?.focus(), 0);
  };

  const captureSessionLocation = async () => {
    if (!navigator?.geolocation) {
      setSessionContext((current) => ({
        ...current,
        locationPermission: "unavailable",
        location: null,
      }));
      return;
    }

    setIsResolvingLocation(true);

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const latitude = position.coords?.latitude ?? null;
      const longitude = position.coords?.longitude ?? null;
      const accuracy = position.coords?.accuracy ?? null;

      let address = "";
      let city = "";
      let region = "";
      let country = "";

      if (latitude !== null && longitude !== null) {
        try {
          const reverseGeocodeResponse = await locationAPI.reverseGeocode(
            latitude,
            longitude,
          );
          const result =
            reverseGeocodeResponse?.data?.data?.results?.[0] ||
            reverseGeocodeResponse?.data?.results?.[0];
          address = result?.formatted_address || "";
          city = result?.address_components?.city || "";
          region = result?.address_components?.state || "";
          country = result?.address_components?.country || "";
        } catch (reverseGeocodeError) {
          debugWarn("Reverse geocoding failed for admin session:", reverseGeocodeError);
        }
      }

      setSessionContext((current) => ({
        ...current,
        locationPermission: "granted",
        location: {
          latitude,
          longitude,
          accuracy,
          address,
          city,
          region,
          country,
          source: "browser-geolocation",
        },
      }));
    } catch (locationError) {
      const denied = locationError?.code === 1;
      setSessionContext((current) => ({
        ...current,
        locationPermission: denied ? "denied" : "unavailable",
        location: null,
      }));
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    try {
      setIsLoading(true);
      setSessionContext((current) => ({
        ...current,
        locationPermission: "prompt",
        location: null,
      }));
      await requestOtp({ nextStep: "permission" });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Unable to send OTP. Please check your credentials.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const nextOtp = [...otp];
    nextOtp[index] = value.slice(-1);
    setOtp(nextOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    event.preventDefault();
    const digits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6)
      .split("");

    if (digits.length === 0) return;

    const nextOtp = ["", "", "", "", "", ""];
    digits.forEach((digit, index) => {
      nextOtp[index] = digit;
    });
    setOtp(nextOtp);
    otpRefs.current[Math.min(digits.length, 6) - 1]?.focus();
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const otpCode = otp.join("");
    if (otpCode.length !== 6) {
      setError("Please enter the 6-digit OTP");
      return;
    }

    try {
      setIsLoading(true);
      const response = await adminAPI.verifyLoginOtp(
        email,
        password,
        otpCode,
        sessionContext,
      );
      const data = response?.data?.data || response?.data;

      if (!data?.admin) {
        throw new Error("Login failed. Please try again.");
      }

      setAuthData("admin", null, data.admin);
      window.dispatchEvent(new Event("adminAuthChanged"));
      navigate("/admin", { replace: true });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP or login failed. Please try again.";
      setError(message);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    try {
      setIsLoading(true);
      setError("");
      await requestOtp({ nextStep: "otp" });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionAndContinue = async () => {
    setError("");
    await captureSessionLocation();
    moveToOtpStep();
  };

  const handleContinueWithoutLocation = () => {
    setSessionContext((current) => ({
      ...current,
      locationPermission:
        current.locationPermission === "prompt"
          ? "denied"
          : current.locationPermission,
    }));
    moveToOtpStep();
  };

  return (
    <div className="relative min-h-screen bg-linear-to-br from-neutral-50 via-gray-100 to-white">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-neutral-900/5 blur-3xl" />
        <div className="absolute bottom-[-80px] right-[-80px] h-72 w-72 rounded-full bg-gray-700/5 blur-3xl" />
      </div>

      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg border-neutral-200 bg-white/90 shadow-2xl backdrop-blur">
          <CardHeader className="pb-4">
            <div className="flex w-full items-center gap-4 sm:gap-5">
              <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl bg-gray-900/5 ring-1 ring-neutral-200">
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-10 w-24 object-contain"
                  loading="lazy"
                  onError={(event) => {
                    if (event.target.src !== quickSpicyLogo) {
                      event.target.src = quickSpicyLogo;
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <CardTitle className="text-3xl leading-tight text-gray-900">
                  {step === "credentials"
                    ? "Admin Login"
                    : step === "permission"
                      ? "Session Permission"
                      : "Verify OTP"}
                </CardTitle>
                <CardDescription className="text-base text-gray-600">
                  {step === "credentials"
                    ? "Sign in with your password, then confirm the OTP."
                    : step === "permission"
                      ? "Allow location access for this admin session so you can audit active devices and last known sign-in location."
                      : `Enter the OTP sent to ${otpMeta.maskedTarget || "your verified admin contact"}.`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {step === "credentials" ? (
              <form onSubmit={handleCredentialSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-base font-medium text-gray-900">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="off"
                    required
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-base font-medium text-gray-900">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="current-password"
                      required
                      className="h-12 pr-12 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-800"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-gray-600">
                  <ShieldCheck className="h-4 w-4 text-neutral-700" />
                  OTP verification is now required for every admin login.
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full bg-black text-white transition-colors hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending OTP..." : "Continue"}
                </Button>
              </form>
            ) : step === "permission" ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-neutral-700" />
                    <div className="space-y-1 text-sm text-neutral-700">
                      <p className="font-medium text-neutral-900">
                        Share current location for this admin session
                      </p>
                      <p>
                        When granted, this session will appear in the admin sessions
                        panel with its last known location, device, and recent activity.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-600">
                  <p className="font-medium text-neutral-900">Current status</p>
                  <p className="mt-1 capitalize">
                    Permission: {sessionContext.locationPermission}
                  </p>
                  {sessionContext.location?.address ? (
                    <p className="mt-1">{sessionContext.location.address}</p>
                  ) : (
                    <p className="mt-1">No location has been attached to this session yet.</p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    className="h-12 bg-black text-white hover:bg-neutral-900"
                    onClick={handlePermissionAndContinue}
                    disabled={isResolvingLocation}
                  >
                    {isResolvingLocation ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Getting location...
                      </>
                    ) : (
                      "Allow & Continue"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    onClick={handleContinueWithoutLocation}
                    disabled={isResolvingLocation}
                  >
                    Continue Without Location
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setError("");
                  }}
                  className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900"
                  disabled={isResolvingLocation}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              </div>
            ) : (
              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div className="space-y-4">
                  <Label className="block text-center text-base font-medium text-gray-900">
                    Enter 6-digit OTP
                  </Label>
                  <div className="flex justify-center gap-2">
                    {otp.map((digit, index) => (
                      <Input
                        key={index}
                        ref={(element) => {
                          otpRefs.current[index] = element;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={index === 0 ? handleOtpPaste : undefined}
                        className="h-14 w-12 text-center text-2xl font-semibold"
                        disabled={isLoading}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("credentials");
                      setError("");
                    }}
                    className="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
                    disabled={isLoading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendTimer > 0 || isLoading}
                    className="font-medium text-black hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                  </button>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full bg-black text-white transition-colors hover:bg-neutral-900"
                  disabled={isLoading}
                >
                  {isLoading ? "Verifying..." : "Verify & Login"}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex-col items-start gap-2 text-sm text-gray-500">
            <span>Admin access now uses password + OTP verification.</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
