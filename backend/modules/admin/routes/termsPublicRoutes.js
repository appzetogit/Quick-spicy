import express from 'express';
import { getTermsPublic } from '../controllers/termsAndConditionController.js';

const router = express.Router();

// Public route for Terms and Conditions
router.get('/terms/public', getTermsPublic);

export default router;

