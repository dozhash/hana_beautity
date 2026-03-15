import { getBot } from '../bot/telegramBot.js';
import { formatPrice } from '../utils/formatPrice.js';

export interface OrderNotificationData {
  orderId: string;
  orderNumber: number;
  phoneNumber: string;
  telegramUsername?: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  totalPrice: number;
}

export async function sendOrderNotificationToAdmin(
  data: OrderNotificationData
): Promise<void> {
  const bot = getBot();
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  if (!bot || !adminId) return;

  const lines: string[] = [
    `🛒 New Order #${data.orderNumber}`,
    '',
    `Phone: ${data.phoneNumber}`,
    `Total: ${formatPrice(data.totalPrice)}`,
    'Status: pending',
    `Items: ${data.items.map((i) => `${i.name}×${i.quantity}`).join(', ')}`,
    ...(data.telegramUsername
      ? ['', 'Telegram: @' + data.telegramUsername.replace(/^@/, '')]
      : []),
  ];

  const text = lines.join('\n');

  try {
    await bot.sendMessage(Number(adminId), text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✓ Mark as Delivered', callback_data: `mark_delivered_${data.orderId}` }],
        ],
      },
    });
  } catch (err) {
    console.error('Failed to send order notification to admin:', err);
  }
}
