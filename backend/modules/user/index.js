import express from 'express';
import userRoutes from './routes/userRoutes.js';

const router = express.Router();

// Mount user routes
router.use('/', userRoutes);

export default router;

