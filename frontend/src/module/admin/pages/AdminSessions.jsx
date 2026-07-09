import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI, locationAPI } from "@/lib/api";
import { clearModuleAuth } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  Clock3,
  Loader2,
  LogOut,
  MapPin,
  MonitorSmartphone,
  Shield,
} from "lucide-react";

const debugWarn = (...args) => {};

const formatDateTime = (value) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
};

export default function AdminSessions() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState("");

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const response = await adminAPI.getSessions();
      const data = response?.data?.data || response?.data || {};
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setCurrentSessionId(data.currentSessionId || "");
    } catch (error) {
      const message =
        error?.response?.data?.message || "Failed to load admin sessions";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const summary = useMemo(() => {
    const activeCount = sessions.filter((session) => session.isActive).length;
    const locationCount = sessions.filter(
      (session) => session.locationPermission === "granted" && session.location,
    ).length;
    return { activeCount, locationCount };
  }, [sessions]);

  const captureCurrentLocation = async () => {
    if (!navigator?.geolocation) {
      await adminAPI.updateCurrentSessionLocation({
        locationPermission: "unavailable",
      });
      return;
    }

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
        debugWarn("Reverse geocode failed for admin session page:", reverseGeocodeError);
      }
    }

    await adminAPI.updateCurrentSessionLocation({
      locationPermission: "granted",
      deviceName: "Admin Browser",
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
    });
  };

  const handleRefreshCurrentLocation = async () => {
    setIsRefreshingLocation(true);
    try {
      await captureCurrentLocation();
      toast.success("Current session location updated");
      await loadSessions();
    } catch (error) {
      const denied = error?.code === 1;
      if (denied) {
        try {
          await adminAPI.updateCurrentSessionLocation({
            locationPermission: "denied",
            deviceName: "Admin Browser",
          });
        } catch {
          // Ignore follow-up write failure here.
        }
      }

      const message = denied
        ? "Location permission was denied"
        : error?.response?.data?.message || "Failed to update session location";
      toast.error(message);
      await loadSessions();
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    setRevokingSessionId(sessionId);
    try {
      const response = await adminAPI.revokeSession(sessionId);
      const currentSessionRevoked =
        response?.data?.data?.currentSessionRevoked || sessionId === currentSessionId;

      if (currentSessionRevoked) {
        clearModuleAuth("admin");
        window.dispatchEvent(new Event("adminAuthChanged"));
        toast.success("Current admin session revoked");
        navigate("/admin/login", { replace: true });
        return;
      }

      toast.success("Admin session revoked");
      await loadSessions();
    } catch (error) {
      const message =
        error?.response?.data?.message || "Failed to revoke admin session";
      toast.error(message);
    } finally {
      setRevokingSessionId("");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Admin Sessions</h1>
          <p className="mt-1 text-neutral-600">
            Review active admin devices, last known locations, and revoke risky sessions.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleRefreshCurrentLocation}
          disabled={isRefreshingLocation}
        >
          {isRefreshingLocation ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating location...
            </>
          ) : (
            "Update Current Location"
          )}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Sessions</CardDescription>
            <CardTitle className="text-3xl">{summary.activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tracked Locations</CardDescription>
            <CardTitle className="text-3xl">{summary.locationCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Session</CardDescription>
            <CardTitle className="text-base">
              {currentSessionId ? "Protected and traceable" : "Unavailable"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Inventory</CardTitle>
          <CardDescription>
            Each admin login now carries its own session record, device fingerprint, and optional location snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
              No admin sessions found.
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    session.isCurrent
                      ? "border-black bg-neutral-50"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                          {session.isCurrent ? "Current Session" : session.isActive ? "Active" : "Revoked"}
                        </span>
                        <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700">
                          {session.browser || "Unknown Browser"}
                        </span>
                        <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700">
                          {session.os || "Unknown OS"}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-start gap-2 text-sm text-neutral-700">
                          <MonitorSmartphone className="mt-0.5 h-4 w-4 text-neutral-500" />
                          <div>
                            <p className="font-medium text-neutral-900">
                              {session.deviceName || "Admin Browser"}
                            </p>
                            <p>{session.deviceType || "unknown"} device</p>
                            <p>{session.ipAddress || "IP unavailable"}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 text-sm text-neutral-700">
                          <Clock3 className="mt-0.5 h-4 w-4 text-neutral-500" />
                          <div>
                            <p className="font-medium text-neutral-900">
                              Logged in: {formatDateTime(session.loginAt)}
                            </p>
                            <p>Last seen: {formatDateTime(session.lastSeenAt)}</p>
                            {session.revokedAt ? (
                              <p>Revoked: {formatDateTime(session.revokedAt)}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-start gap-2 text-sm text-neutral-700 md:col-span-2">
                          <MapPin className="mt-0.5 h-4 w-4 text-neutral-500" />
                          <div>
                            <p className="font-medium text-neutral-900">
                              Location permission: {session.locationPermission}
                            </p>
                            <p>
                              {session.location?.address ||
                                (session.locationPermission === "granted"
                                  ? "Location captured without reverse-geocoded address"
                                  : "No location shared for this session")}
                            </p>
                            {session.location?.latitude !== null &&
                            session.location?.latitude !== undefined ? (
                              <p>
                                {session.location.latitude}, {session.location.longitude}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => handleRevokeSession(session.sessionId)}
                        disabled={revokingSessionId === session.sessionId}
                      >
                        {revokingSessionId === session.sessionId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Revoking...
                          </>
                        ) : (
                          <>
                            <LogOut className="mr-2 h-4 w-4" />
                            Revoke
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-neutral-200 bg-neutral-950 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Protection Notes
          </CardTitle>
          <CardDescription className="text-neutral-300">
            Session revocation is now per-device, and password changes or logout-all still invalidate every active admin token generation.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
