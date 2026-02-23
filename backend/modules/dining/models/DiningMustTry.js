import mongoose from 'mongoose';

const diningMustTrySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    image: {
        type: String, // URL
        required: true
    },
    location: {
        type: String, // "Indore"
        default: "Indore"
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

const DiningMustTry = mongoose.model('DiningMustTry', diningMustTrySchema);
export default DiningMustTry;
