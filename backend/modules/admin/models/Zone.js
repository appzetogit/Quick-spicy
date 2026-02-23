import mongoose from 'mongoose';

const coordinateSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  }
}, { _id: false });

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    serviceLocation: {
      type: String,
      required: false,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true,
      default: 'India'
    },
    zoneName: {
      type: String,
      required: false,
      trim: true
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: false
    },
    unit: {
      type: String,
      enum: ['kilometer', 'miles'],
      default: 'kilometer'
    },
    // Zone coordinates (polygon points)
    coordinates: {
      type: [coordinateSchema],
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length >= 3; // Minimum 3 points for a polygon
        },
        message: 'Zone must have at least 3 coordinates'
      }
    },
    // GeoJSON polygon for spatial queries
    boundary: {
      type: {
        type: String,
        enum: ['Polygon'],
        default: 'Polygon'
      },
      coordinates: {
        type: [[[Number]]],
        required: false // Will be created by pre-save hook
      }
    },
    // Peak Zone Settings (like Zomato)
    peakZoneRideCount: {
      type: Number,
      default: 0,
      min: 0
    },
    peakZoneRadius: {
      type: Number,
      default: 0,
      min: 0
    },
    peakZoneSelectionDuration: {
      type: Number,
      default: 0, // in minutes
      min: 0
    },
    peakZoneDuration: {
      type: Number,
      default: 0, // in minutes
      min: 0
    },
    peakZoneSurgePercentage: {
      type: Number,
      default: 0, // percentage
      min: 0,
      max: 100
    },
    // Status
    isActive: {
      type: Boolean,
      default: true
    },
    // Created by admin
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
zoneSchema.index({ restaurantId: 1 });
zoneSchema.index({ isActive: 1 });
zoneSchema.index({ boundary: '2dsphere' }); // For spatial queries
zoneSchema.index({ serviceLocation: 'text', name: 'text' }); // For text search

// Pre-save middleware to create GeoJSON boundary
zoneSchema.pre('save', function(next) {
  if (this.coordinates && this.coordinates.length >= 3) {
    // Convert coordinates to GeoJSON format: [[[lng, lat], [lng, lat], ...]]
    const geoJsonCoords = this.coordinates.map(coord => [coord.longitude, coord.latitude]);
    // Close the polygon by adding the first point at the end
    geoJsonCoords.push(geoJsonCoords[0]);
    
    this.boundary = {
      type: 'Polygon',
      coordinates: [geoJsonCoords]
    };
  }
  next();
});

// Method to check if a point is within the zone
zoneSchema.methods.containsPoint = function(latitude, longitude) {
  if (!this.boundary || !this.boundary.coordinates) {
    return false;
  }
  
  // Simple point-in-polygon check using ray casting algorithm
  const coords = this.boundary.coordinates[0];
  let inside = false;
  
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    
    const intersect = ((yi > longitude) !== (yj > longitude)) &&
      (longitude < (xj - xi) * (longitude - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
};

export default mongoose.model('Zone', zoneSchema);

