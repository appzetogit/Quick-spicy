import { useState, useEffect, useRef } from "react";
import { adminAPI, uploadAPI } from "@/lib/api";
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
import { User, Mail, Phone, Save, Loader2, Upload, X } from "lucide-react";

export default function AdminProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    profileImage: "",
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getAdminProfile();
      const adminData = response?.data?.data?.admin || response?.data?.admin;
      
      if (adminData) {
        setProfile(adminData);
        setFormData({
          name: adminData.name || "",
          email: adminData.email || "",
          phone: adminData.phone || "",
          profileImage: adminData.profileImage || "",
        });
      }
    } catch (error) {
      console.error("Error fetching admin profile:", error);
      toast.error(
        error?.response?.data?.message || "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.");
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error("File size exceeds 5MB limit.");
      return;
    }

    // Set file and create preview
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      let profileImageUrl = formData.profileImage;

      // Upload image if a new file is selected
      if (selectedFile) {
        try {
          setUploading(true);
          const uploadResponse = await uploadAPI.uploadMedia(selectedFile, {
            folder: 'admin-profiles'
          });
          profileImageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url;
          
          if (!profileImageUrl) {
            throw new Error("Failed to get uploaded image URL");
          }
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          toast.error(
            uploadError?.response?.data?.message || "Failed to upload image"
          );
          setUploading(false);
          setSaving(false);
          return;
        } finally {
          setUploading(false);
        }
      }

      // Update profile with uploaded image URL
      const response = await adminAPI.updateAdminProfile({
        name: formData.name,
        phone: formData.phone || undefined,
        profileImage: profileImageUrl || undefined,
      });

      const updatedAdmin = response?.data?.data?.admin || response?.data?.admin;
      
      if (updatedAdmin) {
        setProfile(updatedAdmin);
        setFormData((prev) => ({
          ...prev,
          profileImage: updatedAdmin.profileImage || "",
        }));
        // Clear selected file and preview
        setSelectedFile(null);
        setImagePreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        // Update localStorage with new admin data
        localStorage.setItem('admin_user', JSON.stringify(updatedAdmin));
        // Dispatch event to notify other components
        window.dispatchEvent(new Event('adminAuthChanged'));
        toast.success("Profile updated successfully");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(
        error?.response?.data?.message || "Failed to update profile"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-neutral-600">Failed to load profile data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return "AD";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Mask email for display
  const maskEmail = (email) => {
    if (!email) return "";
    const [localPart, domain] = email.split("@");
    if (localPart.length <= 2) return email;
    const masked = localPart[0] + "*".repeat(Math.min(localPart.length - 1, 5)) + "@" + domain;
    return masked;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Profile</h1>
        <p className="text-neutral-600 mt-1">Manage your admin profile information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your profile details below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Picture Section */}
            <div className="flex items-center gap-6 pb-6 border-b border-neutral-200">
              <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden border-2 border-neutral-300">
                {profile.profileImage ? (
                  <img
                    src={profile.profileImage}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-semibold text-neutral-600">
                    {getInitials(profile.name)}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900">{profile.name}</p>
                <p className="text-xs text-neutral-500 mt-1">{maskEmail(profile.email)}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Role: <span className="font-medium capitalize">{profile.role || "admin"}</span>
                </p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  disabled
                  className="h-11 bg-neutral-50 cursor-not-allowed"
                />
                <p className="text-xs text-neutral-500">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="Enter phone number (optional)"
                  className="h-11"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="profileImage">Profile Image</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="profileImage"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {imagePreview || profile.profileImage ? (
                  <div className="relative w-48 h-48 border-2 border-neutral-300 rounded-lg overflow-hidden group">
                    <img
                      src={imagePreview || profile.profileImage}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <label
                        htmlFor="profileImage"
                        className="cursor-pointer bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-neutral-100 transition-colors"
                      >
                        Change Image
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg z-10"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="profileImage"
                    className="flex flex-col items-center justify-center w-48 h-48 border-2 border-dashed border-neutral-300 rounded-lg cursor-pointer hover:border-neutral-400 transition-colors bg-neutral-50"
                  >
                    <Upload className="w-8 h-8 text-neutral-400 mb-2" />
                    <p className="text-sm text-neutral-600">Click to upload</p>
                    <p className="text-xs text-neutral-500 mt-1">PNG, JPG, WEBP (max 5MB)</p>
                  </label>
                )}
                {imagePreview && (
                  <p className="text-xs text-green-600 mt-1">
                    New image selected. Click "Save Changes" to upload.
                  </p>
                )}
                {profile.profileImage && !imagePreview && (
                  <p className="text-xs text-neutral-500 mt-1">
                    Hover over the image to change it
                  </p>
                )}
              </div>
            </div>

            {/* Additional Info */}
            <div className="pt-4 border-t border-neutral-200 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">Account Status</span>
                <span className={`font-medium ${profile.isActive ? "text-green-600" : "text-red-600"}`}>
                  {profile.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              {profile.lastLogin && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Last Login</span>
                  <span className="text-neutral-900">
                    {new Date(profile.lastLogin).toLocaleString()}
                  </span>
                </div>
              )}
              {profile.loginCount !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Total Logins</span>
                  <span className="text-neutral-900">{profile.loginCount}</span>
                </div>
              )}
              {profile.createdAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Member Since</span>
                  <span className="text-neutral-900">
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={saving || uploading}
                className="bg-black text-white hover:bg-neutral-900 h-11 px-8"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading image...
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

