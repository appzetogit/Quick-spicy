// Admin module
import express from 'express';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const router = express.Router();

// Auth routes (public: signup/login, protected: me/logout)
router.use('/auth', adminAuthRoutes);

// Admin management routes (protected)
router.use('/', adminRoutes);

export default router;

