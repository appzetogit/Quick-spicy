import mongoose from 'mongoose';

const diningBankOfferSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    cardType: {
        type: String
    },
    discount: {
        type: String
    },
    maxDiscount: {
        type: String
    },
    logo: {
        type: String
    },
    offerText: {
        type: String
    },
    minAmount: {
        type: String
    },
    terms: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const DiningBankOffer = mongoose.model('DiningBankOffer', diningBankOfferSchema);
export default DiningBankOffer;
