import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import DeliveryWithdrawalRequest from '../../delivery/models/DeliveryWithdrawalRequest.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';

/**
 * Get all delivery withdrawal requests (admin)
 * GET /api/admin/delivery-withdrawal/requests?status=Pending|Approved|Rejected&search=&page=1&limit=20
 */
export const getDeliveryWithdrawalRequests = asyncHandler(async (req, res) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;

    const query = {};
    if (status && ['Pending', 'Approved', 'Rejected', 'Processed'].includes(status)) {
      query.status = status;
    }

    if (search && search.trim()) {
      query.$or = [
        { deliveryName: { $regex: search.trim(), $options: 'i' } },
        { deliveryIdString: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const requests = await DeliveryWithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('deliveryId', 'name deliveryId phone email')
      .populate('processedBy', 'name email')
      .lean();

    const total = await DeliveryWithdrawalRequest.countDocuments(query);

    const list = requests.map((r) => ({
      id: r._id,
      deliveryId: r.deliveryId?._id ?? r.deliveryId,
      deliveryName: r.deliveryName || r.deliveryId?.name || 'Unknown',
      deliveryIdString: r.deliveryIdString || r.deliveryId?.deliveryId || 'N/A',
      deliveryPhone: r.deliveryId?.phone || 'N/A',
      amount: r.amount,
      status: r.status,
      paymentMethod: r.paymentMethod,
      bankDetails: r.bankDetails,
      upiId: r.upiId,
      requestedAt: r.requestedAt,
      processedAt: r.processedAt,
      processedBy: r.processedBy ? { name: r.processedBy.name, email: r.processedBy.email } : null,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    return successResponse(res, 200, 'Delivery withdrawal requests retrieved successfully', {
      requests: list,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('Error fetching delivery withdrawal requests:', error);
    return errorResponse(res, 500, 'Failed to fetch delivery withdrawal requests');
  }
});

/**
 * Approve delivery withdrawal request (admin)
 * POST /api/admin/delivery-withdrawal/:id/approve
 */
export const approveDeliveryWithdrawal = asyncHandler(async (req, res) => {
  try {
    const admin = req.admin;
    const { id } = req.params;

    if (!admin?._id) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    const request = await DeliveryWithdrawalRequest.findById(id);
    if (!request) {
      return errorResponse(res, 404, 'Withdrawal request not found');
    }
    if (request.status !== 'Pending') {
      console.warn('[approve] 400: request already', request.status);
      return errorResponse(res, 400, `Withdrawal request is already ${request.status}`);
    }

    if (!request.walletId || !request.transactionId) {
      console.warn('[approve] 400: missing walletId or transactionId', {
        requestId: id,
        walletId: request.walletId,
        transactionId: request.transactionId
      });
      return errorResponse(res, 400, 'Withdrawal request missing wallet or transaction link. Reject this request and ask the delivery boy to create a new withdrawal.');
    }

    const wallet = await DeliveryWallet.findById(request.walletId);
    if (!wallet) {
      console.warn('[approve] 404: wallet not found', request.walletId);
      return errorResponse(res, 404, 'Wallet not found');
    }

    let t = wallet.transactions?.id?.(request.transactionId) ?? null;
    if (!t && Array.isArray(wallet.transactions)) {
      const tid = (request.transactionId?.toString?.() || String(request.transactionId)).trim();
      t = wallet.transactions.find(
        (tx) => tx?._id && (tx._id.toString?.() || String(tx._id)) === tid
      ) ?? null;
    }
    if (!t || t.type !== 'withdrawal' || t.status !== 'Pending') {
      console.warn('[approve] 400: transaction not found or invalid', {
        requestId: id,
        transactionId: request.transactionId,
        walletTxIds: (wallet.transactions || []).slice(0, 5).map((tx) => tx?._id?.toString?.())
      });
      return errorResponse(res, 400, 'Transaction not found or invalid. Reject this request and ask the delivery boy to create a new withdrawal.');
    }

    request.status = 'Approved';
    request.processedAt = new Date();
    request.processedBy = admin._id;
    await request.save();

    t.status = 'Completed';
    t.processedAt = new Date();
    t.processedBy = admin._id;
    wallet.totalWithdrawn = (wallet.totalWithdrawn || 0) + request.amount;
    wallet.markModified('transactions');
    await wallet.save();

    return successResponse(res, 200, 'Withdrawal request approved successfully', {
      request: {
        id: request._id,
        amount: request.amount,
        status: request.status,
        processedAt: request.processedAt
      }
    });
  } catch (error) {
    console.error('Error approving delivery withdrawal:', error?.message || error);
    if (error?.name === 'ValidationError') {
      return errorResponse(res, 400, error.message || 'Validation failed');
    }
    return errorResponse(res, 500, 'Failed to approve withdrawal request');
  }
});

/**
 * Reject delivery withdrawal request (admin)
 * POST /api/admin/delivery-withdrawal/:id/reject
 * Body: { rejectionReason?: string }
 *
 * If walletId/transactionId are missing (old requests), we only mark the request Rejected.
 * Otherwise we also cancel the wallet transaction and refund.
 */
export const rejectDeliveryWithdrawal = asyncHandler(async (req, res) => {
  try {
    const admin = req.admin;
    const { id } = req.params;
    const { rejectionReason } = req.body || {};

    if (!admin?._id) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    const request = await DeliveryWithdrawalRequest.findById(id);
    if (!request) {
      return errorResponse(res, 404, 'Withdrawal request not found');
    }
    if (request.status !== 'Pending') {
      return errorResponse(res, 400, `Withdrawal request is already ${request.status}`);
    }

    request.status = 'Rejected';
    request.processedAt = new Date();
    request.processedBy = admin._id;
    if (rejectionReason != null) request.rejectionReason = String(rejectionReason).trim() || undefined;
    await request.save();

    let refunded = false;
    const hasWalletTx = request.walletId && request.transactionId;

    if (hasWalletTx) {
      const wallet = await DeliveryWallet.findById(request.walletId);
      if (wallet) {
        let t = wallet.transactions?.id?.(request.transactionId) ?? null;
        if (!t && Array.isArray(wallet.transactions)) {
          const tid = (request.transactionId?.toString?.() || String(request.transactionId)).trim();
          t = wallet.transactions.find(
            (tx) => tx?._id && (tx._id.toString?.() || String(tx._id)) === tid
          ) ?? null;
        }
        if (t && t.type === 'withdrawal' && t.status === 'Pending') {
          t.status = 'Cancelled';
          t.processedAt = new Date();
          t.processedBy = admin._id;
          wallet.totalBalance = (wallet.totalBalance || 0) + request.amount;
          wallet.markModified('transactions');
          await wallet.save();
          refunded = true;
        }
      }
    }

    // Fallback for old requests (no walletId/transactionId): find wallet by deliveryId, match Pending withdrawal by amount, refund
    if (!refunded && request.deliveryId) {
      const wallet = await DeliveryWallet.findOne({ deliveryId: request.deliveryId });
      if (wallet && Array.isArray(wallet.transactions)) {
        const pending = wallet.transactions
          .filter(
            (tx) =>
              tx.type === 'withdrawal' &&
              tx.status === 'Pending' &&
              typeof tx.amount === 'number' &&
              tx.amount === request.amount
          )
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const t = pending[0] ?? null;
        if (t) {
          t.status = 'Cancelled';
          t.processedAt = new Date();
          t.processedBy = admin._id;
          wallet.totalBalance = (wallet.totalBalance || 0) + request.amount;
          wallet.markModified('transactions');
          await wallet.save();
          refunded = true;
        }
      }
    }

    return successResponse(res, 200, 'Withdrawal request rejected successfully', {
      request: {
        id: request._id,
        amount: request.amount,
        status: request.status,
        processedAt: request.processedAt,
        rejectionReason: request.rejectionReason
      }
    });
  } catch (error) {
    console.error('Error rejecting delivery withdrawal:', error?.message || error);
    if (error?.name === 'ValidationError') {
      return errorResponse(res, 400, error.message || 'Validation failed');
    }
    return errorResponse(res, 500, 'Failed to reject withdrawal request');
  }
});
