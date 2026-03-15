import { Request, Response } from 'express';
import { Category } from '../models/Category.model.js';

export async function getCategories(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const categories = await Category.find().sort({ createdAt: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

export async function createCategory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { name } = req.body;
    const category = await Category.create({ name });
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create category' });
  }
}

export async function deleteCategory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
}
