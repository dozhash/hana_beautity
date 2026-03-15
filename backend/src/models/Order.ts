import mongoose, { Schema, Document, Model } from 'mongoose';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface IOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface IOrder extends Document {
  userId: number | string;
  orderNumber: number;
  phoneNumber: string;
  telegramUsername?: string;
  telegramUserId?: string;
  phone?: string;
  items: IOrderItem[];
  totalPrice: number;
  status: OrderStatus;
  confirmedByAdmin: boolean;
  createdAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    userId: { type: Schema.Types.Mixed, required: true },
    orderNumber: { type: Number, required: true },
    phoneNumber: { type: String, required: true },
    telegramUsername: { type: String },
    telegramUserId: { type: String },
    phone: { type: String },
    items: { type: [orderItemSchema], required: true },
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    confirmedByAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

orderSchema.index({ userId: 1 });
orderSchema.index({ telegramUserId: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true, sparse: true });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

export const Order: Model<IOrder> =
  mongoose.models.Order ?? mongoose.model<IOrder>('Order', orderSchema);
