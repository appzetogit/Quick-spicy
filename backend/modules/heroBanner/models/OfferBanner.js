import mongoose from 'mongoose';

/**
 * Promotional banners shown in their own carousel below the categories row.
 *
 * Kept separate from HeroBanner rather than adding a "type" to it: the two occupy different
 * places on the page, are curated by different people at different times, and a shared
 * collection would mean every hero query had to remember to exclude offer banners.
 */
const offerBannerSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true,
    trim: true
  },
  cloudinaryPublicId: {
    type: String,
    default: '',
    trim: true
  },
  // Shown to screen readers and used as the alt text; the image alone carries the offer.
  title: {
    type: String,
    default: '',
    trim: true,
    maxlength: 120
  },
  // Where tapping the banner goes. An in-app path such as /user/offers, or a full URL.
  // Empty means the banner is decorative and not clickable.
  linkUrl: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  // Optional branch restriction. Empty shows the banner everywhere, which is the common
  // case; set it when an offer only runs in one area, so customers are not shown a
  // promotion they cannot use.
  zone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    default: null
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// The carousel always reads active banners in display order.
offerBannerSchema.index({ isActive: 1, order: 1 });

export default mongoose.model('OfferBanner', offerBannerSchema);
