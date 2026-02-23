/**
 * Location Integration Example
 * 
 * This file demonstrates how to use the Ola Maps location integration
 * to display area/subLocality names in a Zomato-style UI.
 * 
 * Copy these examples into your components to get started!
 */

import { useLocationSimple } from "../hooks/useLocationSimple"
import LocationDisplay, { CompactLocationDisplay, FullLocationDisplay } from "../components/LocationDisplay"
import { MapPin, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

// ============================================================================
// Example 1: Basic Usage with Hook
// ============================================================================

export function Example1_BasicHook() {
  const { location, loading, error, requestLocation } = useLocationSimple()

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Basic Hook Usage</h2>
      
      {loading && <p>Loading location...</p>}
      
      {error && (
        <div className="flex items-center gap-2 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}
      
      {location && (
        <div className="space-y-2">
          <p><strong>Area:</strong> {location.area || "Not available"}</p>
          <p><strong>City:</strong> {location.city || "Not available"}</p>
          <p><strong>State:</strong> {location.state || "Not available"}</p>
          <p><strong>Coordinates:</strong> {location.latitude}, {location.longitude}</p>
        </div>
      )}
      
      <Button onClick={requestLocation} className="mt-4">
        Get Location
      </Button>
    </div>
  )
}

// ============================================================================
// Example 2: Zomato-Style "Delivering to" Display
// ============================================================================

export function Example2_ZomatoStyle() {
  const { location, loading } = useLocationSimple()

  // Extract area name (primary) or city (fallback)
  const displayName = location?.area || location?.city || "Select location"

  return (
    <div className="flex items-center gap-2 p-4 bg-white rounded-lg shadow">
      <MapPin className="h-5 w-5 text-red-500" fill="currentColor" />
      <div className="flex flex-col">
        <span className="text-xs text-gray-500">Delivering to</span>
        <span className="text-sm font-semibold text-gray-900">
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </span>
          ) : (
            displayName
          )}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Example 3: Using LocationDisplay Component (Recommended)
// ============================================================================

export function Example3_LocationDisplayComponent() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Using LocationDisplay Component</h2>
      
      {/* Full Display */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Full Display</h3>
        <LocationDisplay />
      </div>
      
      {/* Compact Display (for navbar) */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Compact Display (Navbar)</h3>
        <CompactLocationDisplay />
      </div>
      
      {/* Full Location Display (with city/state) */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Full Location Display</h3>
        <FullLocationDisplay />
      </div>
    </div>
  )
}

// ============================================================================
// Example 4: Custom Location Button (Navbar Style)
// ============================================================================

export function Example4_CustomNavbarButton() {
  const { location, loading, requestLocation } = useLocationSimple()
  
  const displayText = location?.area || location?.city || "Select location"

  return (
    <button
      onClick={requestLocation}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <MapPin className="h-4 w-4 text-red-500" fill="currentColor" />
      <div className="flex flex-col items-start">
        <span className="text-xs text-gray-500">Delivering to</span>
        <span className="text-sm font-semibold">
          {loading ? "Loading..." : displayText}
        </span>
      </div>
    </button>
  )
}

// ============================================================================
// Example 5: Location Selector with Dropdown
// ============================================================================

export function Example5_LocationSelector() {
  const { location, loading, error, requestLocation, permissionGranted } = useLocationSimple()
  
  const displayText = location?.area || location?.city || "Select location"

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <MapPin className="h-5 w-5 text-red-500" fill="currentColor" />
        <div className="flex-1">
          <p className="text-xs text-gray-500 mb-1">Delivering to</p>
          <p className="text-sm font-semibold">{loading ? "Loading..." : displayText}</p>
          {location?.city && location?.state && (
            <p className="text-xs text-gray-400 mt-1">
              {location.city}, {location.state}
            </p>
          )}
        </div>
        
        {!permissionGranted && (
          <Button 
            size="sm" 
            onClick={requestLocation}
            disabled={loading}
          >
            {loading ? "Loading..." : "Allow Location"}
          </Button>
        )}
      </div>
      
      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Example 6: Complete Page Header with Location
// ============================================================================

export function Example6_PageHeader() {
  const { location, loading } = useLocationSimple()
  
  const displayText = location?.area || location?.city || "Select location"

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="text-xl font-bold">AppzetoFood</div>
          
          {/* Location */}
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-red-500" fill="currentColor" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Delivering to</span>
              <span className="text-sm font-semibold">
                {loading ? "Loading..." : displayText}
              </span>
            </div>
          </div>
          
          {/* Cart/Profile */}
          <div className="flex items-center gap-4">
            <Button variant="ghost">Cart</Button>
            <Button variant="ghost">Profile</Button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ============================================================================
// Example 7: Display Area Only (Most Common Use Case)
// ============================================================================

export function Example7_AreaOnly() {
  const { location, loading } = useLocationSimple()
  
  // This is the PRIMARY use case: Show ONLY the area name
  // Example: "New Palasia" (not full address)
  const areaName = location?.area || location?.city || "Select location"

  return (
    <div className="flex items-center gap-2 p-4">
      <MapPin className="h-5 w-5 text-red-500" fill="currentColor" />
      <span className="text-lg font-bold">
        {loading ? "Loading..." : areaName}
      </span>
    </div>
  )
}

// ============================================================================
// Usage Instructions:
// ============================================================================

/*
 * HOW TO USE IN YOUR COMPONENTS:
 * 
 * 1. Import the hook:
 *    import { useLocationSimple } from "../hooks/useLocationSimple"
 * 
 * 2. Use the hook:
 *    const { location, loading, error, requestLocation } = useLocationSimple()
 * 
 * 3. Display the area name:
 *    {location?.area || location?.city || "Select location"}
 * 
 * 4. OR use the pre-built component:
 *    import LocationDisplay from "../components/LocationDisplay"
 *    <LocationDisplay />
 * 
 * KEY FIELD: location.area
 * - This contains the subLocality/neighborhood name (e.g., "New Palasia")
 * - Falls back to location.city if area is not available
 * - Always use location.area for the primary display (Zomato-style)
 */

