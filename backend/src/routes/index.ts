import { Router } from 'express';
import { productRouter } from './productRoutes.js';
import { orderRouter } from './orderRoutes.js';
import { categoryRouter } from './categoryRoutes.js';
import { reviewRouter } from './reviewRoutes.js';

export const indexRouter = Router();

indexRouter.get('/', (_req, res) => {
  res.json({ message: 'Cosmetics API v1' });
});

indexRouter.get('/config', (_req, res) => {
  const nick = process.env.ADMIN_TELEGRAM_NICK ?? process.env.ADMIN_TELEGRAM_NICk ?? '';
  const username = (nick || '').trim().replace(/^@/, '');
  res.json({
    adminTelegram: username || null,
  });
});

indexRouter.use('/products', productRouter);
indexRouter.use('/orders', orderRouter);
indexRouter.use('/categories', categoryRouter);
indexRouter.use('/reviews', reviewRouter);
