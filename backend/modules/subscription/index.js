// Subscription module - to be implemented
import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.status(501).json({ message: 'Subscription module not implemented yet' });
});

export default router;

