import { Router } from 'express';
import {
  getCategories,
  createCategory,
  deleteCategory,
} from '../controllers/categoryController.js';

export const categoryRouter = Router();

categoryRouter.get('/', getCategories);
categoryRouter.post('/', createCategory);
categoryRouter.delete('/:id', deleteCategory);
