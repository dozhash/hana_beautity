import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  getMyOrders,
  getOrdersByPhone,
  getUserOrders,
  requestDeliveryConfirmation,
  updateOrderStatus,
  confirmOrderByAdmin,
} from '../controllers/orderController.js';
import { requireTelegramAuth, optionalTelegramAuth } from '../middleware/telegramAuth.js';

export const orderRouter = Router();

orderRouter.post('/', optionalTelegramAuth, createOrder);
orderRouter.get('/', getOrders);
orderRouter.get('/me', requireTelegramAuth, getMyOrders);
orderRouter.get('/by-phone', getOrdersByPhone);
orderRouter.get('/user/:userId', requireTelegramAuth, getUserOrders);
orderRouter.get('/:id', getOrderById);
orderRouter.post('/:id/confirm-received', requireTelegramAuth, requestDeliveryConfirmation);
orderRouter.patch('/:id/status', updateOrderStatus);
orderRouter.patch('/:id/confirm', confirmOrderByAdmin);
