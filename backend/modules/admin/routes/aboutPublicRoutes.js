import express from 'express';
import { getAboutPublic } from '../controllers/aboutController.js';

const router = express.Router();

// Public route for About page
router.get('/about/public', getAboutPublic);

export default router;

