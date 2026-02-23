import mongoose from 'mongoose';

const diningLimelightSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    subheading: {
        type: String,
        required: true
    },
    image: {
        type: String, // URL
        required: true
    },
    discount: {
        type: String, // "25% OFF"
        required: true
    },
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DiningRestaurant' // Optional link to actual restaurant
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

const DiningLimelight = mongoose.model('DiningLimelight', diningLimelightSchema);
export default DiningLimelight;
