import mongoose from 'mongoose';
import RewardSettings from '../models/RewardSettings.js';
import User from '../../auth/models/User.js';
import UserWallet from '../../user/models/UserWallet.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/** GET /api/admin/reward-settings */
export const getRewardSettings = asyncHandler(async (req, res) => {
  const settings = await RewardSettings.getConfig();
  return successResponse(res, 200, 'Reward settings retrieved', { settings });
});

/** PUT /api/admin/reward-settings */
export const updateRewardSettings = asyncHandler(async (req, res) => {
  const {
    signupBonusAmount,
    referralRewardAmount,
    referralMinOrderAmount,
    signupBonusEnabled,
    referralRewardEnabled,
  } = req.body;

  // These numbers are money the platform pays out, so a typo is an expense. Reject
  // anything not a finite non-negative number rather than letting Number('') === 0 or
  // Number('abc') === NaN quietly become a setting.
  const numeric = { signupBonusAmount, referralRewardAmount, referralMinOrderAmount };
  const update = {};
  for (const [field, raw] of Object.entries(numeric)) {
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return errorResponse(res, 400, `${field} must be a number of 0 or more`);
    }
    if (value > 100000) {
      return errorResponse(res, 400, `${field} looks wrong - refusing a value above 100000`);
    }
    update[field] = value;
  }
  if (signupBonusEnabled !== undefined) update.signupBonusEnabled = Boolean(signupBonusEnabled);
  if (referralRewardEnabled !== undefined) update.referralRewardEnabled = Boolean(referralRewardEnabled);

  if (Object.keys(update).length === 0) {
    return errorResponse(res, 400, 'Nothing to update');
  }
  update.updatedBy = req.admin?._id || req.admin?.id || null;

  await RewardSettings.findOneAndUpdate({}, { $set: update }, { new: true, upsert: true, sort: { createdAt: 1 } });
  RewardSettings.invalidateCache();

  const settings = await RewardSettings.getConfig();
  console.log(`[rewardSettings] updated by admin ${update.updatedBy}:`, update);
  return successResponse(res, 200, 'Reward settings saved', { settings });
});

/**
 * GET /api/admin/customer-wallets
 *
 * Paginated and projected on purpose: the Atlas link is throttled, and pulling every user
 * with their full transaction array is how this page would become the next 4-second load.
 * Transactions are counted server-side, never shipped.
 */
export const getCustomerWallets = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const search = String(req.query.search || '').trim();

  const match = { role: 'user' };
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { phone: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [rows, total] = await Promise.all([
    User.aggregate([
      { $match: match },
      { $sort: { 'wallet.balance': -1, createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'userwallets',
          localField: '_id',
          foreignField: 'userId',
          as: 'walletDoc',
        },
      },
      {
        $project: {
          name: 1,
          phone: 1,
          email: 1,
          isActive: 1,
          createdAt: 1,
          referralCode: 1,
          denormalizedBalance: { $ifNull: ['$wallet.balance', 0] },
          balance: { $ifNull: [{ $first: '$walletDoc.balance' }, 0] },
          transactionCount: { $size: { $ifNull: [{ $first: '$walletDoc.transactions' }, []] } },
        },
      },
    ]),
    User.countDocuments(match),
  ]);

  return successResponse(res, 200, 'Customer wallets retrieved', {
    customers: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * PUT /api/admin/customer-wallets/:userId  { balance }
 *
 * Sets a balance by RECORDING the difference as a transaction rather than overwriting the
 * number. A wallet whose balance does not equal the sum of its transactions cannot be
 * audited afterwards, and this is the screen most likely to be used in an argument about
 * money. Writes both the wallet document and the denormalized User.wallet.balance, because
 * the app reads whichever is nearer and they must not disagree.
 */
export const updateCustomerWalletBalance = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { balance, reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return errorResponse(res, 400, 'Invalid customer id');
  }
  const target = Number(balance);
  if (!Number.isFinite(target) || target < 0) {
    return errorResponse(res, 400, 'Balance must be a number of 0 or more');
  }
  if (target > 1000000) {
    return errorResponse(res, 400, 'Refusing a balance above 1000000 - check the value');
  }

  const user = await User.findById(userId).select('_id name phone role');
  if (!user || user.role !== 'user') {
    return errorResponse(res, 404, 'Customer not found');
  }

  const wallet = await UserWallet.findOrCreateByUserId(user._id);
  const before = Number(wallet.balance || 0);
  const delta = Number((target - before).toFixed(2));

  if (delta === 0) {
    return successResponse(res, 200, 'Balance already at that value', {
      customerId: String(user._id), balanceBefore: before, balance: before, adjustment: 0,
    });
  }

  const adminId = req.admin?._id || req.admin?.id || null;
  wallet.addTransaction({
    amount: Math.abs(delta),
    type: delta > 0 ? 'addition' : 'deduction',
    status: 'Completed',
    description: String(reason || '').trim() || 'Admin wallet adjustment',
    paymentMethod: 'wallet',
    metadata: new Map([
      ['source', 'admin_manual_adjustment'],
      ['adminId', String(adminId || '')],
      ['balanceBefore', String(before)],
      ['balanceAfter', String(target)],
    ]),
  });
  await wallet.save();

  await User.findByIdAndUpdate(user._id, {
    'wallet.balance': wallet.balance,
    'wallet.currency': wallet.currency || 'INR',
  });

  console.log(
    `[adminWallet] ${user.name} (${user.phone}) ${before} -> ${wallet.balance} by admin ${adminId}`
  );

  return successResponse(res, 200, 'Wallet balance updated', {
    customerId: String(user._id),
    balanceBefore: before,
    balance: wallet.balance,
    adjustment: delta,
  });
});
