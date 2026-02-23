import express from 'express';
import {
  getWallet,
  getTransactions,
  createTopupOrder,
  verifyTopupPayment,
  addMoney,
  deductMoney,
  addRefund
} from '../controllers/userWalletController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// All routes require user authentication
router.use(authenticate);

// Wallet routes
router.get('/', getWallet); // GET /api/user/wallet
router.get('/transactions', getTransactions); // GET /api/user/wallet/transactions
router.post('/create-topup-order', createTopupOrder); // POST /api/user/wallet/create-topup-order
router.post('/verify-topup-payment', verifyTopupPayment); // POST /api/user/wallet/verify-topup-payment
router.post('/add-money', addMoney); // POST /api/user/wallet/add-money (internal)
router.post('/deduct', deductMoney); // POST /api/user/wallet/deduct (internal)
router.post('/refund', addRefund); // POST /api/user/wallet/refund (internal)

export default router;

