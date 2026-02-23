import express from 'express';
import { getPrivacyPublic } from '../controllers/privacyPolicyController.js';

const router = express.Router();

// Public route for Privacy Policy
router.get('/privacy/public', getPrivacyPublic);

export default router;

