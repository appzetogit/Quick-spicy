import express from 'express';
import heroBannerRoutes from './routes/heroBannerRoutes.js';

const router = express.Router();

router.use('/hero-banners', heroBannerRoutes);

export default router;

