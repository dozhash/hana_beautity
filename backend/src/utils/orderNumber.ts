import { Order } from '../models/Order.js';

const MIN = 1000;
const MAX = 9999;
const MAX_ATTEMPTS = 100;

export async function generateOrderNumber(): Promise<number> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const num = Math.floor(Math.random() * (MAX - MIN + 1)) + MIN;
    const existing = await Order.findOne({ orderNumber: num });
    if (!existing) return num;
  }
  throw new Error('Could not generate unique order number');
}
