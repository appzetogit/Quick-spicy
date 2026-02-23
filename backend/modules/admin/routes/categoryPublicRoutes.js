import express from 'express';
import { getPublicCategories } from '../controllers/categoryController.js';

const router = express.Router();

// Public route - no authentication required
router.get('/categories/public', getPublicCategories);

export default router;

