// Restaurant module
import express from 'express';
import { authenticate } from './middleware/restaurantAuth.js';
import { uploadMiddleware } from '../../shared/utils/cloudinaryService.js';
import restaurantAuthRoutes from './routes/restaurantAuthRoutes.js';
import { getOnboarding, upsertOnboarding, createRestaurantFromOnboardingManual } from './controllers/restaurantOnboardingController.js';
import { getRestaurants, getRestaurantById, getRestaurantByOwner, updateRestaurantProfile, uploadProfileImage, uploadMenuImage, deleteRestaurantAccount, updateDeliveryStatus, getRestaurantsWithDishesUnder250 } from './controllers/restaurantController.js';
import { getRestaurantFinance } from './controllers/restaurantFinanceController.js';
import { getWallet, getWalletTransactions, getWalletStats } from './controllers/restaurantWalletController.js';
import { createWithdrawalRequest, getRestaurantWithdrawalRequests } from './controllers/withdrawalController.js';
import { getMenu, updateMenu, getMenuByRestaurantId, addSection, addItemToSection, addSubsectionToSection, addItemToSubsection, addAddon, getAddons, getAddonsByRestaurantId, updateAddon, deleteAddon } from './controllers/menuController.js';
import { scheduleItemAvailability, cancelScheduledAvailability, getItemSchedule } from './controllers/menuScheduleController.js';
import { getInventory, updateInventory, getInventoryByRestaurantId } from './controllers/inventoryController.js';
import { addStaff, getStaff, getStaffById, updateStaff, deleteStaff } from './controllers/staffManagementController.js';
import { createOffer, getOffers, getOfferById, updateOfferStatus, deleteOffer, getCouponsByItemId, getCouponsByItemIdPublic, getPublicOffers } from './controllers/offerController.js';
import categoryRoutes from './routes/categoryRoutes.js';
import restaurantOrderRoutes from './routes/restaurantOrderRoutes.js';
import outletTimingsRoutes from './routes/outletTimingsRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import { getOutletTimingsByRestaurantId } from './controllers/outletTimingsController.js';

const router = express.Router();

// Restaurant authentication routes
router.use('/auth', restaurantAuthRoutes);

// Onboarding routes for restaurant (authenticated)
router.get('/onboarding', authenticate, getOnboarding);
router.put('/onboarding', authenticate, upsertOnboarding);
router.post('/onboarding/create-restaurant', authenticate, createRestaurantFromOnboardingManual);

// Menu routes (authenticated - for restaurant module)
router.get('/menu', authenticate, getMenu);
router.put('/menu', authenticate, updateMenu);
router.post('/menu/section', authenticate, addSection);
router.post('/menu/section/item', authenticate, addItemToSection);
router.post('/menu/section/subsection', authenticate, addSubsectionToSection);
router.post('/menu/subsection/item', authenticate, addItemToSubsection);

// Add-on routes
router.post('/menu/addon', authenticate, addAddon);
router.get('/menu/addons', authenticate, getAddons);
router.put('/menu/addon/:id', authenticate, updateAddon);
router.delete('/menu/addon/:id', authenticate, deleteAddon);

// Menu item scheduling routes
router.post('/menu/item/schedule', authenticate, scheduleItemAvailability);
router.delete('/menu/item/schedule/:scheduleId', authenticate, cancelScheduledAvailability);
router.get('/menu/item/schedule/:sectionId/:itemId', authenticate, getItemSchedule);

// Inventory routes (authenticated - for restaurant module)
router.get('/inventory', authenticate, getInventory);
router.put('/inventory', authenticate, updateInventory);

// Category routes (authenticated - for restaurant module)
router.use('/categories', categoryRoutes);

// Offer routes (authenticated - for restaurant module)
router.post('/offers', authenticate, createOffer);
router.get('/offers', authenticate, getOffers);
router.get('/offers/item/:itemId/coupons', authenticate, getCouponsByItemId);
// Public offers route - must come before /offers/:id to avoid route conflict
router.get('/offers/public', getPublicOffers);
router.get('/offers/:id', authenticate, getOfferById);
router.put('/offers/:id/status', authenticate, updateOfferStatus);
router.delete('/offers/:id', authenticate, deleteOffer);

// Staff Management routes (authenticated - for restaurant module)
// Must come before /:id to avoid route conflicts
router.post('/staff', authenticate, uploadMiddleware.single('photo'), addStaff);
router.get('/staff', authenticate, getStaff);
router.get('/staff/:id', authenticate, getStaffById);
router.put('/staff/:id', authenticate, updateStaff);
router.delete('/staff/:id', authenticate, deleteStaff);

// Order routes (authenticated - for restaurant module)
// Must come BEFORE /:id route to avoid route conflicts (/:id would match /orders)
router.use('/', restaurantOrderRoutes);

// Complaint routes (authenticated - for restaurant module)
router.use('/complaints', complaintRoutes);

// Finance routes (authenticated - for restaurant module)
// Must come BEFORE /:id route to avoid route conflicts (/:id would match /finance)
router.get('/finance', authenticate, getRestaurantFinance);

// Wallet routes (authenticated - for restaurant module)
// Must come BEFORE /:id route to avoid route conflicts (/:id would match /wallet)
router.get('/wallet', authenticate, getWallet);
router.get('/wallet/transactions', authenticate, getWalletTransactions);
router.get('/wallet/stats', authenticate, getWalletStats);

// Withdrawal routes (authenticated - for restaurant module)
router.post('/withdrawal/request', authenticate, createWithdrawalRequest);
router.get('/withdrawal/requests', authenticate, getRestaurantWithdrawalRequests);

// Restaurant routes (public - for user module)
router.get('/list', getRestaurants);
router.get('/under-250', getRestaurantsWithDishesUnder250);
// Menu and inventory routes must come before /:id to avoid route conflicts
router.get('/:restaurantId/offers/item/:itemId/coupons', getCouponsByItemIdPublic);
router.get('/:restaurantId/outlet-timings', getOutletTimingsByRestaurantId);
router.get('/:id/menu', getMenuByRestaurantId);
router.get('/:id/addons', getAddonsByRestaurantId);
router.get('/:id/inventory', getInventoryByRestaurantId);
router.get('/:id', getRestaurantById);

// Restaurant routes (authenticated - for restaurant module)
router.get('/owner/me', authenticate, getRestaurantByOwner);

// Profile routes (authenticated - for restaurant module)
router.put('/profile', authenticate, updateRestaurantProfile);
router.delete('/profile', authenticate, deleteRestaurantAccount);
router.post('/profile/image', authenticate, uploadMiddleware.single('file'), uploadProfileImage);
router.post('/profile/menu-image', authenticate, uploadMiddleware.single('file'), uploadMenuImage);

// Delivery status route (authenticated - for restaurant module)
router.put('/delivery-status', authenticate, updateDeliveryStatus);

// Outlet Timings routes (authenticated - for restaurant module)
// Must come after all /:id routes to avoid route conflicts
router.use('/', outletTimingsRoutes);

export default router;