import { Response } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { formatPrice } from '../utils/formatPrice.js';
import { sendOrderNotificationToAdmin } from '../services/orderNotification.js';
import { getBot } from '../bot/telegramBot.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import type { AuthenticatedRequest } from '../middleware/telegramAuth.js';

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidPhone(phoneNumber: string): boolean {
  const digits = normalizePhone(phoneNumber);
  return digits.length >= 9 && digits.length <= 15;
}

export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      userId,
      telegramUsername,
      telegramUserId,
      phone,
      phoneNumber,
      items,
      totalPrice,
    } = req.body;

    const rawPhone = phoneNumber ?? phone;
    if (!rawPhone || typeof rawPhone !== 'string') {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }
    if (!isValidPhone(rawPhone)) {
      res.status(400).json({ error: 'Invalid phone number. Use digits only (e.g. +998901234567 or 901234567)' });
      return;
    }

    const normalizedPhone = normalizePhone(rawPhone);
    let uid: number | string | null =
      req.telegramUser?.id != null
        ? Number(req.telegramUser.id)
        : userId != null && userId !== ''
          ? Number(userId)
          : null;

    if (uid == null || (typeof uid === 'number' && Number.isNaN(uid))) {
      uid = `phone:${normalizedPhone}`;
    }

    const tgUsername = telegramUsername ?? req.telegramUser?.username;

    const orderNum = await generateOrderNumber();

    const order = await Order.create({
      userId: uid,
      orderNumber: orderNum,
      phoneNumber: rawPhone.trim(),
      telegramUsername: tgUsername,
      telegramUserId: typeof uid === 'number' ? String(uid) : undefined,
      phone: rawPhone.trim(),
      items,
      totalPrice,
      status: 'pending',
    });

    void sendOrderNotificationToAdmin({
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      phoneNumber: order.phoneNumber,
      telegramUsername: order.telegramUsername,
      items: (items ?? []).map((i: { name: string; quantity: number; price: number }) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
      totalPrice: totalPrice ?? 0,
    });

    res.status(201).json({
      success: true,
      ...order.toObject(),
    });
  } catch (error) {
    res.status(400).json({ error: 'Failed to create order' });
  }
}

export async function getOrders(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

export async function getOrdersByPhone(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rawPhone = (req.query.phone as string) ?? req.body?.phone;
    if (!rawPhone || typeof rawPhone !== 'string') {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }
    if (!isValidPhone(rawPhone)) {
      res.status(400).json({ error: 'Invalid phone number' });
      return;
    }
    const normalizedPhone = normalizePhone(rawPhone);
    const orders = await Order.find({ userId: `phone:${normalizedPhone}` }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

export async function getOrderById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
}

export async function getMyOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.telegramUser?.id != null ? Number(req.telegramUser.id) : null;
    if (userId == null) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    // Match orders by userId (number or string) or by telegramUserId field
    const orders = await Order.find({
      $or: [
        { userId },
        { userId: String(userId) },
        { telegramUserId: String(userId) },
      ],
    }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

export async function getUserOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const authUserId = req.telegramUser?.id != null ? Number(req.telegramUser.id) : null;
    if (authUserId == null) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const targetUserId = Number(userId);
    if (Number.isNaN(targetUserId) || targetUserId !== authUserId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const orders = await Order.find({ userId: targetUserId })
      .sort({ createdAt: -1 })
      .select('orderNumber items totalPrice status createdAt confirmedByAdmin');
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

export async function requestDeliveryConfirmation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.telegramUser?.id != null ? Number(req.telegramUser.id) : null;
    const { id } = req.params;

    if (userId == null || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const order = await Order.findById(id);
    if (!order || Number(order.userId) !== userId) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status !== 'delivered') {
      res.status(400).json({ error: 'Order must be delivered first' });
      return;
    }

    const bot = getBot();
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (bot && adminId) {
      const orderNum = order.orderNumber ?? order._id;
      const text = `📦 Delivery confirmation requested\n\nOrder #${orderNum}\nPhone: ${order.phoneNumber ?? order.phone ?? 'N/A'}\nTotal: ${formatPrice(order.totalPrice)}`;
      await bot.sendMessage(Number(adminId), text, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✓ Confirm', callback_data: `confirm_order_${order._id}` },
              { text: '✗ Reject', callback_data: `reject_order_${order._id}` },
            ],
          ],
        },
      });
    }

    res.json({ message: 'Confirmation requested' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to request confirmation' });
  }
}

export async function updateOrderStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const update: Record<string, unknown> = { status };
    if (status === 'delivered') {
      update.confirmedByAdmin = true;
    }

    const order = await Order.findByIdAndUpdate(id, update, { new: true });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
}

export async function confirmOrderByAdmin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const order = await Order.findByIdAndUpdate(
      id,
      { status: 'delivered', confirmedByAdmin: true },
      { new: true }
    );
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm order' });
  }
}
