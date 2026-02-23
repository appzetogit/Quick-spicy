import express from 'express';
import {
  submitComplaint,
  getUserComplaints,
  getComplaintDetails
} from '../controllers/complaintController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// All routes require user authentication
router.use(authenticate);

// Complaint routes
router.post('/', submitComplaint);
router.get('/', getUserComplaints);
router.get('/:id', getComplaintDetails);

export default router;
