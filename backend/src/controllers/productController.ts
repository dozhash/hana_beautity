import { Response } from 'express';
import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Review } from '../models/Review.js';
import { Order } from '../models/Order.js';
import type { AuthenticatedRequest } from '../middleware/telegramAuth.js';
import { ensureBilingualProduct } from '../utils/productShape.js';

async function updateProductRating(productId: mongoose.Types.ObjectId): Promise<void> {
  const agg = await Review.aggregate([
    { $match: { productId } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg = agg[0]?.avg ?? 0;
  const rounded = Math.round(avg * 10) / 10;
  await Product.findByIdAndUpdate(productId, { rating: rounded });
}

export async function getProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { categoryId, page = '0', limit = '10' } = req.query;
    const pageNum = Math.max(0, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = pageNum * limitNum;

    const filter: Record<string, unknown> = {};
    if (categoryId && typeof categoryId === 'string' && mongoose.Types.ObjectId.isValid(categoryId)) {
      filter.categoryId = new mongoose.Types.ObjectId(categoryId);
    }

    const [products, totalCount] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(filter),
    ]);

    // Ensure rating is accurate: fetch from reviews if product has reviews but rating is 0
    const productIds = (products as { _id: mongoose.Types.ObjectId }[]).map((p) => p._id);
    const ratingAgg = await Review.aggregate([
      { $match: { productId: { $in: productIds } } },
      { $group: { _id: '$productId', avg: { $avg: '$rating' } } },
    ]);
    const ratingByProduct = Object.fromEntries(
      ratingAgg.map((r) => [String(r._id), Math.round(r.avg * 10) / 10])
    );
    const productsWithRating = (products as Record<string, unknown>[]).map((p) =>
      ensureBilingualProduct({
        ...p,
        rating: ratingByProduct[String(p._id)] ?? (p.rating ?? 0),
      })
    );

    res.json({
      products: productsWithRating,
      totalCount,
      page: pageNum,
      limit: limitNum,
      hasMore: (pageNum + 1) * limitNum < totalCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

export async function getProductById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(ensureBilingualProduct(product as Record<string, unknown>));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}

export async function getProductDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const product = await Product.findById(id)
      .populate('categoryId', 'name')
      .populate({
        path: 'recommendedProducts',
        select: 'name price images shortDescription',
      })
      .lean();

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const p = ensureBilingualProduct(product as Record<string, unknown>);
    const recs = (p.recommendedProducts as Record<string, unknown>[] | undefined) ?? [];
    p.recommendedProducts = recs.map((r) => ensureBilingualProduct(r)) as unknown;

    res.json(p);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
}

export async function getProductReviews(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { page = '0', limit = '5' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const pageNum = Math.max(0, parseInt(String(page), 10));
    const limitNum = Math.min(20, Math.max(1, parseInt(String(limit), 10)));
    const skip = pageNum * limitNum;

    const pid = new mongoose.Types.ObjectId(id);

    const [reviews, totalCount] = await Promise.all([
      Review.find({ productId: pid }).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Review.countDocuments({ productId: pid }),
    ]);

    const agg = await Review.aggregate([
      { $match: { productId: pid } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating = agg[0]?.avg ?? 0;
    const totalReviews = agg[0]?.count ?? 0;

    res.json({
      reviews,
      totalCount,
      page: pageNum,
      limit: limitNum,
      hasMore: (pageNum + 1) * limitNum < totalCount,
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
}

export async function createReview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { orderId, rating, comment } = req.body;

    const commentStr = String(comment ?? '').trim();
    if (!orderId || !rating) {
      res.status(400).json({ error: 'orderId and rating required' });
      return;
    }
    if (!commentStr) {
      res.status(400).json({ error: 'Please write a text review' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(orderId)) {
      res.status(400).json({ error: 'Invalid product or order ID' });
      return;
    }

    const productId = new mongoose.Types.ObjectId(id);
    const orderIdObj = new mongoose.Types.ObjectId(orderId);

    const order = await Order.findById(orderIdObj);
    if (!order) {
      res.status(403).json({ error: 'Order not found' });
      return;
    }

    if (order.status !== 'delivered' || !order.confirmedByAdmin) {
      res.status(403).json({ error: 'Can only review after order is delivered and confirmed' });
      return;
    }

    const hasProduct = order.items.some((i) => String(i.productId) === String(id));
    if (!hasProduct) {
      res.status(400).json({ error: 'Product not in this order' });
      return;
    }

    const uid = req.telegramUser?.id ?? Number(order.userId);
    if (req.telegramUser && Number(order.userId) !== uid) {
      res.status(403).json({ error: 'Order not found or access denied' });
      return;
    }

    const ratingNum = Math.min(5, Math.max(1, parseInt(String(rating), 10)));

    const existing = await Review.findOne({ userId: uid, productId, orderId: orderIdObj });
    if (existing) {
      res.status(400).json({ error: 'Already reviewed this product for this order' });
      return;
    }

    const review = await Review.create({
      userId: uid,
      productId,
      orderId: orderIdObj,
      rating: ratingNum,
      comment: commentStr,
    });

    await updateProductRating(productId);

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create review' });
  }
}

export async function createProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(ensureBilingualProduct(product.toObject() as unknown as Record<string, unknown>));
  } catch (error) {
    res.status(400).json({ error: 'Failed to create product' });
  }
}

export async function updateProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(ensureBilingualProduct(product as Record<string, unknown>));
  } catch (error) {
    res.status(400).json({ error: 'Failed to update product' });
  }
}

export async function deleteProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

export async function getAllReviews(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 })
      .populate('productId', 'name')
      .lean();
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
}

export async function deleteReview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid review ID' });
      return;
    }
    const review = await Review.findByIdAndDelete(id);
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    await updateProductRating(review.productId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
}

