import { useState, useEffect, useCallback, useRef } from 'react'
import { zoneAPI } from '@/lib/api'
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


/**
 * Hook to detect and manage user's zone based on location
 * Automatically detects zone when location is available
 */
// probe: this instance is asking about a specific point (a delivery address, a live-vs-
// address comparison) rather than tracking THE customer's zone. Probes must not touch the
// shared localStorage zone: writing poisoned the app-wide zone with whatever point was
// probed, and reading meant a single failed lookup answered with the LIVE location's zone.
// That substitution is what showed B.PETA customers "restaurant is assigned to a different
// zone" on valid orders whenever one detect call hiccuped - an unknown zone must stay
// unknown, not borrow an answer from a different question.
export function useZone(location, { probe = false } = {}) {
  const [zoneId, setZoneId] = useState(null)
  const [zoneStatus, setZoneStatus] = useState('loading') // 'loading' | 'IN_SERVICE' | 'OUT_OF_SERVICE'
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevCoordsRef = useRef({ latitude: null, longitude: null })

  // Detect zone when location is available
  const detectZone = useCallback(async (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await zoneAPI.detectZone(lat, lng)
      
      if (response.data?.success) {
        const data = response.data.data
        
        if (data.status === 'IN_SERVICE' && data.zoneId) {
          setZoneId(data.zoneId)
          setZone(data.zone)
          setZoneStatus('IN_SERVICE')
          
          // Store in localStorage for persistence
          if (!probe) {
            localStorage.setItem('userZoneId', data.zoneId)
            localStorage.setItem('userZone', JSON.stringify(data.zone))
          }
        } else {
          // OUT_OF_SERVICE
          setZoneId(null)
          setZone(null)
          setZoneStatus('OUT_OF_SERVICE')
          if (!probe) {
            localStorage.removeItem('userZoneId')
            localStorage.removeItem('userZone')
          }
        }
      } else {
        throw new Error(response.data?.message || 'Failed to detect zone')
      }
    } catch (err) {
      debugError('Error detecting zone:', err)
      setError(err.response?.data?.message || err.message || 'Failed to detect zone')
      
      // Try to use cached zone if available - but never for a probe: the cache holds the
      // customer's own zone, which is the answer to a different question.
      const cachedZoneId = probe ? null : localStorage.getItem('userZoneId')
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem('userZone')
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      } else {
        // Network/CORS/backend failures should not be treated as confirmed out-of-zone.
        setZoneStatus('loading')
        setZoneId(null)
        setZone(null)
      }
    } finally {
      setLoading(false)
    }
  }, [probe])

  // Auto-detect zone when location changes
  useEffect(() => {
    const lat = location?.latitude
    const lng = location?.longitude

    // Check if coordinates have changed significantly (threshold: ~10 meters)
    const coordThreshold = 0.0001 // approximately 10 meters
    const coordsChanged = 
      !prevCoordsRef.current.latitude ||
      !prevCoordsRef.current.longitude ||
      Math.abs(prevCoordsRef.current.latitude - (lat || 0)) > coordThreshold ||
      Math.abs(prevCoordsRef.current.longitude - (lng || 0)) > coordThreshold

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // Only detect zone if coordinates changed significantly
      if (coordsChanged) {
        prevCoordsRef.current = { latitude: lat, longitude: lng }
        detectZone(lat, lng)
      }
    } else {
      // Try to use cached zone if location not available
      const cachedZoneId = probe ? null : localStorage.getItem('userZoneId')
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem('userZone')
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      } else {
        setZoneStatus('OUT_OF_SERVICE')
        setZoneId(null)
        setZone(null)
      }
    }
  }, [location?.latitude, location?.longitude, detectZone])

  // Manual refresh zone
  const refreshZone = useCallback(() => {
    const lat = location?.latitude
    const lng = location?.longitude
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      detectZone(lat, lng)
    }
  }, [location?.latitude, location?.longitude, detectZone])

  return {
    zoneId,
    zone,
    zoneStatus,
    loading,
    error,
    isInService: zoneStatus === 'IN_SERVICE',
    isOutOfService: zoneStatus === 'OUT_OF_SERVICE',
    refreshZone
  }
}

