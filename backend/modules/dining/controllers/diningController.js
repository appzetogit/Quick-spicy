import DiningRestaurant from "../models/DiningRestaurant.js";
import DiningCategory from "../models/DiningCategory.js";
import DiningLimelight from "../models/DiningLimelight.js";
import DiningBankOffer from "../models/DiningBankOffer.js";
import DiningMustTry from "../models/DiningMustTry.js";
import DiningOfferBanner from "../models/DiningOfferBanner.js";
import DiningStory from "../models/DiningStory.js";
import TableBooking from "../models/TableBooking.js";
import DiningReview from "../models/DiningReview.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import emailService from "../../auth/services/emailService.js";

// Get all dining restaurants (with filtering)
export const getRestaurants = async (req, res) => {
  try {
    const { city } = req.query;
    let query = {};

    // Simple filter support
    if (city) {
      query.location = { $regex: city, $options: "i" };
    }

    const restaurants = await DiningRestaurant.find(query);
    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get single restaurant by slug
export const getRestaurantBySlug = async (req, res) => {
  try {
    const restaurant = await DiningRestaurant.findOne({
      slug: req.params.slug,
    });

    // If not found in GamingRestaurant, check regular Restaurant
    let actualRestaurant = restaurant;
    if (!actualRestaurant) {
      actualRestaurant = await Restaurant.findOne({ slug: req.params.slug });
    }

    if (!actualRestaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    res.status(200).json({
      success: true,
      data: actualRestaurant,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get dining categories
export const getCategories = async (req, res) => {
  try {
    const categories = await DiningCategory.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get limelight features
export const getLimelight = async (req, res) => {
  try {
    const limelights = await DiningLimelight.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: limelights.length,
      data: limelights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get bank offers
export const getBankOffers = async (req, res) => {
  try {
    const offers = await DiningBankOffer.find({ isActive: true });
    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get must tries
export const getMustTries = async (req, res) => {
  try {
    const mustTries = await DiningMustTry.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: mustTries.length,
      data: mustTries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get offer banners
export const getOfferBanners = async (req, res) => {
  try {
    const banners = await DiningOfferBanner.find({ isActive: true })
      .populate("restaurant", "name")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get dining stories
export const getStories = async (req, res) => {
  try {
    const stories = await DiningStory.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      success: true,
      count: stories.length,
      data: stories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Create a new table booking
export const createBooking = async (req, res) => {
  try {
    const { restaurant, guests, date, timeSlot, specialRequest } = req.body;
    const userId = req.user._id;

    const booking = await TableBooking.create({
      restaurant,
      user: userId,
      guests,
      date,
      timeSlot,
      specialRequest,
      status: "confirmed",
    });

    // Populate restaurant data for the success page
    let populatedBooking = await TableBooking.findById(booking._id).populate(
      "restaurant",
      "name location image",
    );
    let bookingObj = populatedBooking.toObject();

    // Check if restaurant population failed (might be in DiningRestaurant collection)
    if (!bookingObj.restaurant || typeof bookingObj.restaurant === "string") {
      const diningRes = await DiningRestaurant.findById(
        booking.restaurant,
      ).select("name location image");
      if (diningRes) {
        bookingObj.restaurant = diningRes;
      }
    }

    res.status(201).json({
      success: true,
      message: "Booking confirmed successfully",
      data: bookingObj,
    });

    // Send confirmation email asynchronously if user has email
    if (req.user.email) {
      emailService
        .sendBookingConfirmation(req.user.email, bookingObj)
        .catch((err) => {
          console.error("Failed to send booking confirmation email:", err);
        });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

// Get current user's bookings
export const getUserBookings = async (req, res) => {
  try {
    const bookings = await TableBooking.find({ user: req.user._id })
      .populate("restaurant", "name location image")
      .sort({ createdAt: -1 });

    // Manually handle population if the restaurant wasn't found in "Restaurant" collection
    // (it might be in "DiningRestaurant" collection)
    const processedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const bookingObj = booking.toObject();

        if (
          !bookingObj.restaurant ||
          typeof bookingObj.restaurant === "string"
        ) {
          // Try finding in DiningRestaurant
          const diningRes = await DiningRestaurant.findById(
            booking.restaurant,
          ).select("name location image");
          if (diningRes) {
            bookingObj.restaurant = diningRes;
          }
        }
        return bookingObj;
      }),
    );

    res.status(200).json({
      success: true,
      count: processedBookings.length,
      data: processedBookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
};

// Get bookings for a specific restaurant (for owners)
export const getRestaurantBookings = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    // In a real app, we should check if req.user is the owner of this restaurant

    const bookings = await TableBooking.find({ restaurant: restaurantId })
      .populate("user", "name phone")
      .sort({ date: 1, timeSlot: 1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch restaurant bookings",
      error: error.message,
    });
  }
};

// Update booking status (for restaurant owners)
export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    const updateData = { status };
    if (status === "checked-in") {
      updateData.checkInTime = new Date();
    } else if (status === "completed") {
      updateData.checkOutTime = new Date();
    }

    const booking = await TableBooking.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true },
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      data: booking,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
      error: error.message,
    });
  }
};

// Create a review for a completed booking
export const createDiningReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user._id;

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to review this booking",
      });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "You can only review completed bookings",
      });
    }

    const review = await DiningReview.create({
      booking: bookingId,
      user: userId,
      restaurant: booking.restaurant,
      rating,
      comment,
    });

    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
};
