import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Submit Delivery Signup Step 1 - Basic Details
 * POST /api/delivery/signup/details
 */
const signupDetailsSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().optional().allow(null, ''),
  address: Joi.string().trim().required(),
  city: Joi.string().trim().required(),
  state: Joi.string().trim().required(),
  vehicleType: Joi.string().valid('bike', 'scooter', 'bicycle', 'car').required(),
  vehicleName: Joi.string().trim().optional().allow(null, ''),
  vehicleNumber: Joi.string().trim().required(),
  panNumber: Joi.string().trim().required(),
  aadharNumber: Joi.string().trim().required()
});

export const submitSignupDetails = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery; // From authenticate middleware
    const {
      name,
      email,
      address,
      city,
      state,
      vehicleType,
      vehicleName,
      vehicleNumber,
      panNumber,
      aadharNumber
    } = req.body;

    // Validate input
    const { error } = signupDetailsSchema.validate(req.body);
    if (error) {
      return errorResponse(res, 400, error.details[0].message);
    }

    // Update delivery profile with signup details
    const updateData = {
      name: name.trim(),
      email: email ? email.trim().toLowerCase() : null,
      location: {
        addressLine1: address.trim(),
        city: city.trim(),
        state: state.trim()
      },
      vehicle: {
        type: vehicleType,
        number: vehicleNumber.trim(),
        model: vehicleName ? vehicleName.trim() : null,
        brand: vehicleName ? vehicleName.trim() : null // Use vehicleName as brand if provided
      },
      documents: {
        ...delivery.documents,
        pan: {
          ...delivery.documents?.pan,
          number: panNumber.trim()
        },
        aadhar: {
          ...delivery.documents?.aadhar,
          number: aadharNumber.trim()
        }
      }
    };

    const updatedDelivery = await Delivery.findByIdAndUpdate(
      delivery._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!updatedDelivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    return successResponse(res, 200, 'Signup details saved successfully', {
      profile: updatedDelivery,
      nextStep: 'documents'
    });
  } catch (error) {
    logger.error(`Error saving signup details: ${error.message}`);
    
    // Handle duplicate email error
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Email already exists');
    }
    
    return errorResponse(res, 500, 'Failed to save signup details');
  }
});

/**
 * Submit Delivery Signup Step 2 - Documents
 * POST /api/delivery/signup/documents
 */
const signupDocumentsSchema = Joi.object({
  profilePhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  aadharPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  panPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  drivingLicensePhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required()
});

export const submitSignupDocuments = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery; // From authenticate middleware
    const {
      profilePhoto,
      aadharPhoto,
      panPhoto,
      drivingLicensePhoto
    } = req.body;

    // Validate input
    const { error } = signupDocumentsSchema.validate(req.body);
    if (error) {
      return errorResponse(res, 400, error.details[0].message);
    }

    // Validate that all required documents are provided
    if (!profilePhoto || !aadharPhoto || !panPhoto || !drivingLicensePhoto) {
      return errorResponse(res, 400, 'All documents are required');
    }

    // Log document URLs for debugging
    logger.info('Storing documents for delivery partner', {
      deliveryId: delivery.deliveryId || delivery._id,
      profilePhoto: profilePhoto.url ? 'Uploaded' : 'Missing',
      aadharPhoto: aadharPhoto.url ? 'Uploaded' : 'Missing',
      panPhoto: panPhoto.url ? 'Uploaded' : 'Missing',
      drivingLicensePhoto: drivingLicensePhoto.url ? 'Uploaded' : 'Missing'
    });

    // Update delivery profile with documents
    // Store all documents in database with Cloudinary URLs
    const updateData = {
      // Store profile image with URL and publicId
      profileImage: {
        url: profilePhoto.url,
        publicId: profilePhoto.publicId
      },
      // Store all documents in documents schema
      documents: {
        // Profile photo in documents.photo (for backward compatibility)
        photo: profilePhoto.url,
        // Aadhar card document
        aadhar: {
          ...delivery.documents?.aadhar,
          document: aadharPhoto.url,
          verified: false // Will be verified by admin later
        },
        // PAN card document
        pan: {
          ...delivery.documents?.pan,
          document: panPhoto.url,
          verified: false // Will be verified by admin later
        },
        // Driving license document
        drivingLicense: {
          ...delivery.documents?.drivingLicense,
          document: drivingLicensePhoto.url,
          verified: false // Will be verified by admin later
        }
      },
      // Mark signup as complete - status remains pending until admin approval
      status: 'pending'
    };

    const updatedDelivery = await Delivery.findByIdAndUpdate(
      delivery._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!updatedDelivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    // Log successful document storage
    logger.info('Documents stored successfully in database', {
      deliveryId: updatedDelivery.deliveryId || updatedDelivery._id,
      hasProfileImage: !!updatedDelivery.profileImage?.url,
      hasAadhar: !!updatedDelivery.documents?.aadhar?.document,
      hasPan: !!updatedDelivery.documents?.pan?.document,
      hasDrivingLicense: !!updatedDelivery.documents?.drivingLicense?.document
    });

    return successResponse(res, 200, 'Documents uploaded successfully', {
      profile: updatedDelivery,
      signupComplete: true
    });
  } catch (error) {
    logger.error(`Error uploading documents: ${error.message}`);
    return errorResponse(res, 500, 'Failed to upload documents');
  }
});

