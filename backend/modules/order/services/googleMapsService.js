import axios from 'axios';
import { getGoogleMapsApiKey } from '../../../shared/utils/envService.js';

/**
 * Google Maps Distance Matrix API Service
 * Calculates travel time and distance between two points
 */
class GoogleMapsService {
  constructor() {
    this.apiKey = null; // Will be loaded from database when needed
    this.baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  }

  /**
   * Get API key from database (lazy loading)
   */
  async getApiKey() {
    if (!this.apiKey) {
      this.apiKey = await getGoogleMapsApiKey();
      if (!this.apiKey) {
        console.warn('⚠️ Google Maps API key not found in database. Please set it in Admin → System → Environment Variables');
      }
    }
    return this.apiKey;
  }

  /**
   * Get travel time and distance between two points
   * @param {Object} origin - { latitude, longitude }
   * @param {Object} destination - { latitude, longitude }
   * @param {String} mode - 'driving', 'walking', 'bicycling', 'transit'
   * @param {String} trafficModel - 'best_guess', 'pessimistic', 'optimistic'
   * @returns {Promise<Object>} - { distance (km), duration (minutes), trafficLevel }
   */
  async getTravelTime(origin, destination, mode = 'driving', trafficModel = 'best_guess') {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      // Fallback to haversine distance calculation if API key not available
      console.warn('⚠️ Google Maps API key not available, using fallback calculation');
      return this.calculateHaversineDistance(origin, destination);
    }

    try {
      const originStr = `${origin.latitude},${origin.longitude}`;
      const destStr = `${destination.latitude},${destination.longitude}`;

      const params = {
        origins: originStr,
        destinations: destStr,
        mode: mode,
        key: apiKey,
        units: 'metric',
        departure_time: 'now' // For traffic-aware routing
      };

      // Add traffic model for driving mode
      if (mode === 'driving') {
        params.traffic_model = trafficModel;
      }

      const response = await axios.get(this.baseUrl, { params });

      if (response.data.status !== 'OK') {
        console.error('❌ Google Maps API Error:', response.data.status, response.data.error_message);
        // Fallback to haversine
        return this.calculateHaversineDistance(origin, destination);
      }

      const element = response.data.rows[0].elements[0];

      if (element.status !== 'OK') {
        console.error('❌ Google Maps Element Error:', element.status);
        return this.calculateHaversineDistance(origin, destination);
      }

      // Extract distance in km
      const distance = element.distance.value / 1000; // Convert meters to km

      // Extract duration in minutes
      let duration = element.duration.value / 60; // Convert seconds to minutes

      // Check if traffic duration is available (for driving mode)
      let trafficLevel = 'low';
      if (element.duration_in_traffic) {
        const trafficDuration = element.duration_in_traffic.value / 60; // minutes
        const trafficMultiplier = trafficDuration / duration;
        
        if (trafficMultiplier >= 1.4) {
          trafficLevel = 'high';
        } else if (trafficMultiplier >= 1.2) {
          trafficLevel = 'medium';
        }
        
        duration = trafficDuration; // Use traffic-aware duration
      }

      return {
        distance: parseFloat(distance.toFixed(2)),
        duration: Math.ceil(duration), // Round up to nearest minute
        trafficLevel,
        raw: {
          distance: element.distance,
          duration: element.duration,
          durationInTraffic: element.duration_in_traffic
        }
      };
    } catch (error) {
      console.error('❌ Error calling Google Maps API:', error.message);
      // Fallback to haversine calculation
      return this.calculateHaversineDistance(origin, destination);
    }
  }

  /**
   * Fallback: Calculate distance using Haversine formula
   * @param {Object} origin - { latitude, longitude }
   * @param {Object} destination - { latitude, longitude }
   * @returns {Object} - { distance (km), duration (minutes), trafficLevel }
   */
  calculateHaversineDistance(origin, destination) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(destination.latitude - origin.latitude);
    const dLon = this.toRad(destination.longitude - origin.longitude);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(origin.latitude)) * Math.cos(this.toRad(destination.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Estimate duration: assume average speed of 30 km/h in city
    const duration = Math.ceil((distance / 30) * 60); // Convert to minutes

    return {
      distance: parseFloat(distance.toFixed(2)),
      duration,
      trafficLevel: 'low' // Can't determine traffic without API
    };
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Batch calculate travel times for multiple destinations
   * @param {Object} origin - { latitude, longitude }
   * @param {Array} destinations - [{ latitude, longitude }, ...]
   * @returns {Promise<Array>} - Array of travel time results
   */
  async getBatchTravelTimes(origin, destinations) {
    const promises = destinations.map(dest => 
      this.getTravelTime(origin, dest)
    );
    return Promise.all(promises);
  }
}

export default new GoogleMapsService();

