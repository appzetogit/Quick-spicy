import express from 'express';
import { getPublicEnvVariables } from '../controllers/envVariablesController.js';

const router = express.Router();

// Public route - no authentication required
// GET /api/env/public
router.get('/public', getPublicEnvVariables);

export default router;

