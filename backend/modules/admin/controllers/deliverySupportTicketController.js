import DeliverySupportTicket from '../models/DeliverySupportTicket.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

/**
 * Create support ticket (Delivery Boy)
 * POST /api/delivery/support-tickets
 */
export const createSupportTicket = asyncHandler(async (req, res) => {
  console.log('Creating support ticket, request body:', req.body);
  console.log('Delivery partner:', req.delivery ? { _id: req.delivery._id, name: req.delivery.name, phone: req.delivery.phone } : 'Not found');
  
  const { subject, description, category, priority } = req.body;
  const delivery = req.delivery; // From authenticate middleware

  if (!delivery) {
    console.error('Delivery partner not authenticated');
    return errorResponse(res, 401, 'Delivery partner not authenticated');
  }

  // Get delivery phone - phone is required in Delivery model, so it should exist
  const deliveryPhone = delivery.phone;
  const deliveryName = delivery.name || 'Delivery Partner';

  // Validate phone exists (it's required in Delivery model)
  if (!deliveryPhone || !deliveryPhone.trim()) {
    console.error('Delivery phone is missing:', {
      deliveryId: delivery._id,
      deliveryName: deliveryName,
      delivery: {
        _id: delivery._id,
        name: delivery.name,
        phone: delivery.phone
      }
    });
    return errorResponse(res, 400, 'Delivery partner phone number is required');
  }

  // Normalize category and priority
  const normalizedCategory = (category && category.trim()) ? category.trim() : 'other';
  const normalizedPriority = (priority && priority.trim()) ? priority.trim() : 'medium';

  try {
    const ticket = await DeliverySupportTicket.create({
      deliveryId: delivery._id,
      deliveryName: deliveryName.trim(),
      deliveryPhone: deliveryPhone.trim(),
      subject: subject.trim(),
      description: description.trim(),
      category: normalizedCategory,
      priority: normalizedPriority,
      status: 'open'
    });

    console.log('Ticket created successfully:', ticket.ticketId);
    return successResponse(res, 201, 'Support ticket created successfully', ticket);
  } catch (error) {
    console.error('Error creating support ticket:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      errors: error.errors
    });
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message).join(', ');
      return errorResponse(res, 400, `Validation error: ${errors}`);
    }
    
    if (error.code === 11000) {
      // Duplicate key error (likely ticketId) - retry once
      console.log('Duplicate ticketId detected, retrying...');
      try {
        const ticket = await DeliverySupportTicket.create({
          deliveryId: delivery._id,
          deliveryName: deliveryName.trim(),
          deliveryPhone: deliveryPhone.trim(),
          subject: subject.trim(),
          description: description.trim(),
          category: normalizedCategory,
          priority: normalizedPriority,
          status: 'open'
        });
        console.log('Retry successful, ticket created:', ticket.ticketId);
        return successResponse(res, 201, 'Support ticket created successfully', ticket);
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        return errorResponse(res, 500, 'Failed to create ticket. Please try again.');
      }
    }
    
    // Re-throw to be handled by asyncHandler
    throw error;
  }
});

/**
 * Get all tickets for delivery boy
 * GET /api/delivery/support-tickets
 */
export const getDeliveryTickets = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { status, page = 1, limit = 50 } = req.query;

    const query = { deliveryId: delivery._id };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const total = await DeliverySupportTicket.countDocuments(query);

    const tickets = await DeliverySupportTicket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    return successResponse(res, 200, 'Tickets retrieved successfully', {
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching delivery tickets:', error);
    return errorResponse(res, 500, 'Failed to fetch tickets');
  }
});

/**
 * Get ticket by ID (Delivery Boy)
 * GET /api/delivery/support-tickets/:id
 */
export const getTicketById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const delivery = req.delivery;

    const ticket = await DeliverySupportTicket.findOne({
      _id: id,
      deliveryId: delivery._id
    }).lean();

    if (!ticket) {
      return errorResponse(res, 404, 'Ticket not found');
    }

    return successResponse(res, 200, 'Ticket retrieved successfully', ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return errorResponse(res, 500, 'Failed to fetch ticket');
  }
});

/**
 * Get all support tickets (Admin)
 * GET /api/admin/delivery-support-tickets
 */
export const getAllTickets = asyncHandler(async (req, res) => {
  try {
    const { status, priority, category, search, page = 1, limit = 50 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }
    if (category) {
      query.category = category;
    }
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ticketId: { $regex: search, $options: 'i' } },
        { deliveryName: { $regex: search, $options: 'i' } },
        { deliveryPhone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const total = await DeliverySupportTicket.countDocuments(query);

    const tickets = await DeliverySupportTicket.find(query)
      .populate('deliveryId', 'name phone deliveryId')
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Add deliveryId from populated deliveryId field
    tickets.forEach(ticket => {
      if (ticket.deliveryId && typeof ticket.deliveryId === 'object') {
        ticket.deliveryBoyId = ticket.deliveryId.deliveryId || ticket.deliveryId._id?.toString().slice(-6) || 'N/A';
      }
    });

    return successResponse(res, 200, 'Tickets retrieved successfully', {
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return errorResponse(res, 500, 'Failed to fetch tickets');
  }
});

/**
 * Get ticket by ID (Admin)
 * GET /api/admin/delivery-support-tickets/:id
 */
export const getTicketByIdAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await DeliverySupportTicket.findById(id)
      .populate('deliveryId', 'name phone deliveryId')
      .populate('respondedBy', 'name email')
      .lean();

    if (!ticket) {
      return errorResponse(res, 404, 'Ticket not found');
    }

    return successResponse(res, 200, 'Ticket retrieved successfully', ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return errorResponse(res, 500, 'Failed to fetch ticket');
  }
});

/**
 * Update ticket status/response (Admin)
 * PUT /api/admin/delivery-support-tickets/:id
 */
export const updateTicket = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminResponse, priority } = req.body;
    const admin = req.admin;

    const ticket = await DeliverySupportTicket.findById(id);

    if (!ticket) {
      return errorResponse(res, 404, 'Ticket not found');
    }

    const updateData = {};
    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      } else if (status === 'closed') {
        updateData.closedAt = new Date();
      }
    }
    if (adminResponse !== undefined) {
      updateData.adminResponse = adminResponse.trim();
      updateData.respondedBy = admin._id;
      updateData.respondedAt = new Date();
    }
    if (priority) {
      updateData.priority = priority;
    }

    const updatedTicket = await DeliverySupportTicket.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('deliveryId', 'name phone deliveryId')
      .populate('respondedBy', 'name email')
      .lean();

    return successResponse(res, 200, 'Ticket updated successfully', updatedTicket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    return errorResponse(res, 500, 'Failed to update ticket');
  }
});

/**
 * Get ticket statistics (Admin)
 * GET /api/admin/delivery-support-tickets/stats
 */
export const getTicketStats = asyncHandler(async (req, res) => {
  try {
    const total = await DeliverySupportTicket.countDocuments();
    const open = await DeliverySupportTicket.countDocuments({ status: 'open' });
    const inProgress = await DeliverySupportTicket.countDocuments({ status: 'in_progress' });
    const resolved = await DeliverySupportTicket.countDocuments({ status: 'resolved' });
    const closed = await DeliverySupportTicket.countDocuments({ status: 'closed' });

    return successResponse(res, 200, 'Statistics retrieved successfully', {
      total,
      open,
      inProgress,
      resolved,
      closed
    });
  } catch (error) {
    console.error('Error fetching ticket statistics:', error);
    return errorResponse(res, 500, 'Failed to fetch statistics');
  }
});

