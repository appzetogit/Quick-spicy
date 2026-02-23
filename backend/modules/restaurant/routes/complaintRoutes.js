import express from 'express';
import {
  getRestaurantComplaints,
  getComplaintDetails,
  respondToComplaint
} from '../controllers/complaintController.js';
import { authenticate } from '../middleware/restaurantAuth.js';

const router = express.Router();

// All routes require restaurant authentication
router.use(authenticate);

// Complaint routes
router.get('/', getRestaurantComplaints);
router.get('/:id', getComplaintDetails);
router.put('/:id/respond', respondToComplaint);

export default router;
