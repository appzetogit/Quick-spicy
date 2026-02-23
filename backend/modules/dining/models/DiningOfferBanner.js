import mongoose from 'mongoose';

const diningOfferBannerSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true,
        trim: true
    },
    cloudinaryPublicId: {
        type: String,
        required: true,
        trim: true
    },
    percentageOff: {
        type: String,
        required: true,
        trim: true
    },
    tagline: {
        type: String,
        required: true,
        trim: true
    },
    restaurant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

export default mongoose.model('DiningOfferBanner', diningOfferBannerSchema);
