import { Router } from 'express';
import {
  getProducts,
  getProductById,
  getProductDetails,
  getProductReviews,
  createReview,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import { requireTelegramAuth, optionalTelegramAuth } from '../middleware/telegramAuth.js';

export const productRouter = Router();

productRouter.get('/', optionalTelegramAuth, getProducts);

productRouter.get('/:id/details', optionalTelegramAuth, getProductDetails);
productRouter.get('/:id/reviews', getProductReviews);
productRouter.post('/:id/review', optionalTelegramAuth, createReview);
productRouter.get('/:id', optionalTelegramAuth, getProductById);

productRouter.post('/', createProduct);
productRouter.put('/:id', updateProduct);
productRouter.delete('/:id', deleteProduct);
