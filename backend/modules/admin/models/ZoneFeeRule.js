import mongoose from 'mongoose';

/**
 * Delivery charges for one zone, overriding the platform-wide fee settings
 * (Admin -> Delivery & Platform Fee -> zone filter).
 *
 * Kept apart from FeeSettings on purpose: every save of the main settings creates a new
 * FeeSettings document, so rules stored on it would be lost the next time anyone saved.
 * A zone with no rule simply uses the platform-wide charges.
 */
const zoneFeeRuleSchema = new mongoose.Schema(
  {
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, unique: true },
    zoneName: { type: String, default: '' },
    // Customers in this zone pay no delivery fee. Rider pay is unaffected - it comes from
    // the rider commission rules, not from the fee the customer pays.
    freeDelivery: { type: Boolean, default: false },
    // Used when freeDelivery is off. null = use the platform-wide value for that field.
    deliveryFee: { type: Number, default: null, min: 0 },
    deliveryBaseDistanceKm: { type: Number, default: null, min: 0 },
    deliveryFeePerKm: { type: Number, default: null, min: 0 },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('ZoneFeeRule', zoneFeeRuleSchema);
