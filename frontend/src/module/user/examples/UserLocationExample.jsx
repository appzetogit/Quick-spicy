/**
 * OLA Maps Integration - Simple Example Component
 * 
 * यह component OLA Maps API का उपयोग करके user की current location fetch करता है
 * और coordinates को readable address में convert करता है।
 * 
 * Usage:
 * import UserLocationExample from './examples/UserLocationExample'
 * <UserLocationExample />
 */

import React, { useState, useEffect } from 'react';
import { locationAPI } from '@/lib/api';

const UserLocationExample = () => {
  const [address, setAddress] = useState("Location fetch ho rahi hai...");
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Step 1: User ki current location coordinates lena
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ lat: latitude, lng: longitude });
          fetchReadableAddress(latitude, longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
          setAddress("Location permission denied.");
          setError(error.message);
          setLoading(false);
        }
      );
    } else {
      setError("Geolocation is not supported by your browser");
      setAddress("Browser geolocation not supported");
    }
  }, []);

  const fetchReadableAddress = async (lat, lng) => {
    try {
      setLoading(true);
      setError(null);
      
      // Step 2: Backend API call karna (backend OLA Maps API use karta hai)
      // Backend endpoint: GET /api/location/reverse?lat={lat}&lng={lng}
      const response = await locationAPI.reverseGeocode(lat, lng);

      if (response.data && response.data.success && response.data.data) {
        const data = response.data.data;
        
        // Handle different response structures
        let result = null;
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
          result = data.results[0];
        } else if (data.result && Array.isArray(data.result) && data.result.length > 0) {
          result = data.result[0];
        }

        if (result) {
          // Address ko state mein set karna (e.g., Indore, New Palasia)
          const fullAddress = result.formatted_address || 
                            result.address || 
                            `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setAddress(fullAddress);
        } else {
          setAddress("Address not found");
        }
      } else {
        setAddress("Address dhundne mein problem hui.");
        setError(response.data?.message || "Invalid response from API");
      }
    } catch (error) {
      console.error("OLA Maps API Error:", error);
      setAddress("Address dhundne mein problem hui.");
      setError(error.message || "API call failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', maxWidth: '500px', margin: '20px auto' }}>
      <h2 style={{ marginBottom: '16px', color: '#333' }}>Live Tracking Status</h2>
      
      {loading && (
        <div style={{ marginBottom: '12px', color: '#666' }}>
          Loading location...
        </div>
      )}
      
      {error && (
        <div style={{ marginBottom: '12px', color: '#d32f2f', padding: '8px', background: '#ffebee', borderRadius: '4px' }}>
          Error: {error}
        </div>
      )}
      
      <div style={{ marginBottom: '12px' }}>
        <strong>Coordinates:</strong> {coords.lat ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : 'Not available'}
      </div>
      
      <div style={{ marginBottom: '12px' }}>
        <strong>Current Area:</strong> {address}
      </div>
      
      <button 
        onClick={() => {
          if (coords.lat && coords.lng) {
            fetchReadableAddress(coords.lat, coords.lng);
          } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const { latitude, longitude } = position.coords;
                setCoords({ lat: latitude, lng: longitude });
                fetchReadableAddress(latitude, longitude);
              },
              (error) => {
                setError(error.message);
              }
            );
          }
        }}
        style={{
          padding: '8px 16px',
          background: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginTop: '8px'
        }}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Refresh Location'}
      </button>
    </div>
  );
};

export default UserLocationExample;

