// Notification module - to be implemented
import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.status(501).json({ message: 'Notification module not implemented yet' });
});

export default router;

