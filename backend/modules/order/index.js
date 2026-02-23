import express from 'express';
import orderRoutes from './routes/orderRoutes.js';
import etaRoutes from './routes/etaRoutes.js';

const router = express.Router();

router.use('/', orderRoutes);
router.use('/api', etaRoutes); // ETA routes

export default router;

