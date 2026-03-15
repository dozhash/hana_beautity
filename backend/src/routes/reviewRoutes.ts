import { Router } from 'express';
import { getAllReviews, deleteReview } from '../controllers/productController.js';

export const reviewRouter = Router();

reviewRouter.get('/', getAllReviews);
reviewRouter.delete('/:id', deleteReview);
