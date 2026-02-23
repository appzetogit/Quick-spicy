import express from 'express';
import locationRoutes from './routes/locationRoutes.js';

const router = express.Router();

// Mount location routes
router.use('/', locationRoutes);

export default router;

