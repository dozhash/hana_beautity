import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  name_uz?: string;
  name_ru?: string;
  price: number;
  shortDescription?: string;
  fullDescription?: string;
  description?: string;
  description_uz?: string;
  description_ru?: string;
  howToUse?: string;
  whenToUse?: string;
  suitableFor?: string;
  usage_uz?: string;
  usage_ru?: string;
  for_whom_uz?: string;
  for_whom_ru?: string;
  images: string[];
  categoryId: mongoose.Types.ObjectId;
  recommendedProducts: mongoose.Types.ObjectId[];
  stock: number;
  rating: number;
  createdAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    name_uz: { type: String },
    name_ru: { type: String },
    price: { type: Number, required: true },
    shortDescription: { type: String },
    fullDescription: { type: String },
    description: { type: String },
    description_uz: { type: String },
    description_ru: { type: String },
    howToUse: { type: String },
    whenToUse: { type: String },
    suitableFor: { type: String },
    usage_uz: { type: String },
    usage_ru: { type: String },
    for_whom_uz: { type: String },
    for_whom_ru: { type: String },
    images: { type: [String], default: [] },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    recommendedProducts: {
      type: [Schema.Types.ObjectId],
      ref: 'Product',
      default: [],
    },
    stock: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

productSchema.index({ categoryId: 1 });
productSchema.index({ createdAt: -1 });

export const Product: Model<IProduct> =
  mongoose.models.Product ?? mongoose.model<IProduct>('Product', productSchema);
