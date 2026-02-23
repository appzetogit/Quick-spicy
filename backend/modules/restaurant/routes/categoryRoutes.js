import express from 'express';
import {
  getCategories,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories
} from '../controllers/categoryController.js';
import { authenticate } from '../middleware/restaurantAuth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get active categories
router.get('/', getCategories);

// Get all categories (including inactive)
router.get('/all', getAllCategories);

// Create category
router.post('/', createCategory);

// Update category
router.put('/:id', updateCategory);

// Delete category
router.delete('/:id', deleteCategory);

// Reorder categories
router.put('/reorder', reorderCategories);

export default router;

