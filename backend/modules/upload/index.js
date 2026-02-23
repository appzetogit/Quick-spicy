import express from 'express';
import uploadRoutes from './routes/uploadRoutes.js';

const router = express.Router();

router.use('/upload', uploadRoutes);

export default router;


