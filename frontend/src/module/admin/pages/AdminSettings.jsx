import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI } from "@/lib/api";
import { clearModuleAuth } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Save, Loader2, Shield, LogOut } from "lucide-react";

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

export default function AdminSettings() {
  const navigate = useNavigate();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [errors, setErrors] = useState({});

  const resetAdminSession = () => {
    clearModuleAuth("admin");
    localStorage.removeItem("admin_authenticated");
    localStorage.removeItem("admin_user");
    sessionStorage.removeItem("adminAuthData");
    window.dispatchEvent(new Event("adminAuthChanged"));
  };

  const handlePasswordChange = (field, value) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[field];
        return nextErrors;
      });
    }
  };

  const validatePasswordForm = () => {
    const nextErrors = {};

    if (!passwordForm.currentPassword) {
      nextErrors.currentPassword = "Current password is required";
    }

    if (!passwordForm.newPassword) {
      nextErrors.newPassword = "New password is required";
    } else if (passwordForm.newPassword.length < 6) {
      nextErrors.newPassword = "Password must be at least 6 characters long";
    }

    if (!passwordForm.confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your new password";
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      nextErrors.newPassword = "New password must be different from current password";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (!validatePasswordForm()) {
      return;
    }

    try {
      setSaving(true);
      const response = await adminAPI.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      const forceReauth = response?.data?.data?.forceReauth;

      toast.success(
        forceReauth
          ? "Password changed. All admin sessions were logged out."
          : "Password changed successfully"
      );

      if (forceReauth) {
        resetAdminSession();
        navigate("/admin/login", { replace: true });
      }
    } catch (error) {
      debugError("Error changing password:", error);
      const errorMessage =
        error?.response?.data?.message || "Failed to change password";

      if (
        errorMessage.includes("current password") ||
        errorMessage.includes("incorrect")
      ) {
        setErrors({ currentPassword: errorMessage });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAllSessions = async () => {
    try {
      setLoggingOutAll(true);
      await adminAPI.logoutAll();
      resetAdminSession();
      toast.success("All admin sessions have been logged out");
      navigate("/admin/login", { replace: true });
    } catch (error) {
      debugError("Error logging out all admin sessions:", error);
      const errorMessage =
        error?.response?.data?.message || "Failed to log out all admin sessions";
      toast.error(errorMessage);
    } finally {
      setLoggingOutAll(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Settings</h1>
        <p className="text-neutral-600 mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-neutral-700" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    handlePasswordChange("currentPassword", e.target.value)
                  }
                  placeholder="Enter your current password"
                  className={`h-11 pr-12 ${
                    errors.currentPassword ? "border-red-500" : ""
                  }`}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-neutral-800"
                  disabled={saving}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="text-sm text-red-600">{errors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    handlePasswordChange("newPassword", e.target.value)
                  }
                  placeholder="Enter your new password"
                  className={`h-11 pr-12 ${
                    errors.newPassword ? "border-red-500" : ""
                  }`}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-neutral-800"
                  disabled={saving}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-red-600">{errors.newPassword}</p>
              )}
              <p className="text-xs text-neutral-500">
                Password must be at least 6 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    handlePasswordChange("confirmPassword", e.target.value)
                  }
                  placeholder="Confirm your new password"
                  className={`h-11 pr-12 ${
                    errors.confirmPassword ? "border-red-500" : ""
                  }`}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-neutral-800"
                  disabled={saving}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-200">
              <Button
                type="submit"
                disabled={saving}
                className="h-11 px-8 bg-black text-white hover:bg-neutral-900"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Change Password
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-neutral-700" />
            <CardTitle>Session Control</CardTitle>
          </div>
          <CardDescription>
            Revoke every active admin session across devices and browsers
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">
            Use this to force every admin login to sign in again immediately.
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={loggingOutAll}
            onClick={handleLogoutAllSessions}
            className="h-11 px-6"
          >
            {loggingOutAll ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging Out...
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 mr-2" />
                Log Out All Sessions
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
