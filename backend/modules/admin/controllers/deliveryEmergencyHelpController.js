import DeliveryEmergencyHelp from '../models/DeliveryEmergencyHelp.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

/**
 * Get emergency help numbers (Admin)
 * GET /api/admin/delivery-emergency-help
 */
export const getEmergencyHelp = asyncHandler(async (req, res) => {
  try {
    const emergencyHelp = await DeliveryEmergencyHelp.findOne({ status: true })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ updatedAt: -1 })
      .lean();

    if (!emergencyHelp) {
      // Return default empty structure if no record exists
      return successResponse(res, 200, 'Emergency help numbers retrieved successfully', {
        medicalEmergency: '',
        accidentHelpline: '',
        contactPolice: '',
        insurance: '',
        status: true
      });
    }

    return successResponse(res, 200, 'Emergency help numbers retrieved successfully', emergencyHelp);
  } catch (error) {
    console.error('Error fetching emergency help numbers:', error);
    return errorResponse(res, 500, 'Failed to fetch emergency help numbers');
  }
});

/**
 * Get emergency help numbers (Public - for delivery boy)
 * GET /api/delivery/emergency-help
 */
export const getEmergencyHelpPublic = asyncHandler(async (req, res) => {
  try {
    const emergencyHelp = await DeliveryEmergencyHelp.findOne({ status: true })
      .sort({ updatedAt: -1 })
      .lean();

    if (!emergencyHelp) {
      // Return default empty structure if no record exists
      return successResponse(res, 200, 'Emergency help numbers retrieved successfully', {
        medicalEmergency: '',
        accidentHelpline: '',
        contactPolice: '',
        insurance: ''
      });
    }

    // Return only the phone numbers, not admin info
    return successResponse(res, 200, 'Emergency help numbers retrieved successfully', {
      medicalEmergency: emergencyHelp.medicalEmergency || '',
      accidentHelpline: emergencyHelp.accidentHelpline || '',
      contactPolice: emergencyHelp.contactPolice || '',
      insurance: emergencyHelp.insurance || ''
    });
  } catch (error) {
    console.error('Error fetching emergency help numbers:', error);
    return errorResponse(res, 500, 'Failed to fetch emergency help numbers');
  }
});

/**
 * Create or update emergency help numbers
 * POST /api/admin/delivery-emergency-help
 */
export const createOrUpdateEmergencyHelp = asyncHandler(async (req, res) => {
  try {
    const { medicalEmergency, accidentHelpline, contactPolice, insurance } = req.body;
    const adminId = req.admin._id;

    // Validate phone numbers (optional, but if provided should be exactly 10 digits)
    const phoneRegex = /^\d{10}$/;
    
    if (medicalEmergency && !phoneRegex.test(String(medicalEmergency).trim())) {
      return errorResponse(res, 400, 'Medical emergency phone number must be exactly 10 digits');
    }
    if (accidentHelpline && !phoneRegex.test(String(accidentHelpline).trim())) {
      return errorResponse(res, 400, 'Accident helpline phone number must be exactly 10 digits');
    }
    if (contactPolice && !phoneRegex.test(String(contactPolice).trim())) {
      return errorResponse(res, 400, 'Contact police phone number must be exactly 10 digits');
    }
    if (insurance && !phoneRegex.test(String(insurance).trim())) {
      return errorResponse(res, 400, 'Insurance phone number must be exactly 10 digits');
    }

    // Find existing active record
    let emergencyHelp = await DeliveryEmergencyHelp.findOne({ status: true });

    if (emergencyHelp) {
      // Update existing record
      emergencyHelp.medicalEmergency = medicalEmergency || emergencyHelp.medicalEmergency;
      emergencyHelp.accidentHelpline = accidentHelpline || emergencyHelp.accidentHelpline;
      emergencyHelp.contactPolice = contactPolice || emergencyHelp.contactPolice;
      emergencyHelp.insurance = insurance || emergencyHelp.insurance;
      emergencyHelp.updatedBy = adminId;
      await emergencyHelp.save();
    } else {
      // Create new record
      emergencyHelp = await DeliveryEmergencyHelp.create({
        medicalEmergency: medicalEmergency || '',
        accidentHelpline: accidentHelpline || '',
        contactPolice: contactPolice || '',
        insurance: insurance || '',
        createdBy: adminId,
        updatedBy: adminId,
        status: true
      });
    }

    const populated = await DeliveryEmergencyHelp.findById(emergencyHelp._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    return successResponse(res, 200, 'Emergency help numbers saved successfully', populated);
  } catch (error) {
    console.error('Error saving emergency help numbers:', error);
    return errorResponse(res, 500, 'Failed to save emergency help numbers');
  }
});

/**
 * Toggle emergency help status
 * PATCH /api/admin/delivery-emergency-help/status
 */
export const toggleEmergencyHelpStatus = asyncHandler(async (req, res) => {
  try {
    const emergencyHelp = await DeliveryEmergencyHelp.findOne({ status: true });

    if (!emergencyHelp) {
      return errorResponse(res, 404, 'Emergency help configuration not found');
    }

    emergencyHelp.status = !emergencyHelp.status;
    emergencyHelp.updatedBy = req.admin._id;
    await emergencyHelp.save();

    const populated = await DeliveryEmergencyHelp.findById(emergencyHelp._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    return successResponse(res, 200, 'Emergency help status updated successfully', populated);
  } catch (error) {
    console.error('Error toggling emergency help status:', error);
    return errorResponse(res, 500, 'Failed to update emergency help status');
  }
});
