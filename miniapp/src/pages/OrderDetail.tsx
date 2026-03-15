import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { t, formatPrice } from '../lib/translations';
import type { TranslationKey } from '../lib/translations';

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  _id: string;
  orderNumber?: number;
  items: OrderItem[];
  totalPrice: number;
  status: string;
  confirmedByAdmin?: boolean;
  phoneNumber?: string;
  createdAt: string;
}

const STATUS_BADGES: Record<string, { labelKey: TranslationKey; className: string }> = {
  pending: { labelKey: 'statusPending', className: 'bg-amber-100 text-amber-800' },
  paid: { labelKey: 'statusPaid', className: 'bg-blue-100 text-blue-800' },
  preparing: { labelKey: 'statusPreparing', className: 'bg-indigo-100 text-indigo-800' },
  shipped: { labelKey: 'statusShipped', className: 'bg-purple-100 text-purple-800' },
  delivered: { labelKey: 'statusDelivered', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { labelKey: 'statusCancelled', className: 'bg-gray-100 text-gray-600' },
};

function getStatusBadge(status: string, t: Record<string, string | ((n: number) => string)>) {
  const badge = STATUS_BADGES[status];
  if (badge) return { label: t[badge.labelKey] as string, className: badge.className };
  return { label: status, className: 'bg-gray-100 text-gray-700' };
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [adminTelegram, setAdminTelegram] = useState<string | null>(null);

  const fetchOrder = (isRefresh = false) => {
    if (!id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    api
      .get<Order>(`/api/orders/${id}`)
      .then((res) => setOrder(res.data))
      .catch(() => setError(true))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    fetchOrder();
  }, [id]);

  useEffect(() => {
    if (order && order.status !== 'delivered') {
      api.get<{ adminTelegram: string | null }>('/api/config').then((res) => {
        if (res.data?.adminTelegram) setAdminTelegram(res.data.adminTelegram);
      }).catch(() => {});
    }
  }, [order?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">{t.loadingOrder}</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
        <p className="text-gray-600 mb-6">{t.orderNotFound}</p>
        <Link
          to="/orders"
          className="px-6 py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700"
        >
          {t.backToOrders}
        </Link>
      </div>
    );
  }

  const badge = getStatusBadge(order.status, t);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <Link
        to="/orders"
        className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-5 h-5 mr-2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        {t.backToOrders}
      </Link>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex justify-between items-start gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {t.orderNumberLabel} #{order.orderNumber ?? order._id.slice(-6)}
              </h1>
              <span
                className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded-full ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <button
              type="button"
              onClick={() => fetchOrder(true)}
              disabled={refreshing}
              className={`p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0 ${refreshing ? 'opacity-50' : ''}`}
              aria-label={t.refresh}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {new Date(order.createdAt).toLocaleDateString('uz-UZ', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t.products}</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li
                key={`${item.productId}-${item.quantity}`}
                className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"
              >
                <span className="text-gray-800">
                  {item.name} ×{item.quantity}
                </span>
                <span className="text-rose-600 font-medium">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-lg font-bold">
              <span>{t.total}</span>
              <span className="text-rose-600">{formatPrice(order.totalPrice)}</span>
            </div>
          </div>

          {order.phoneNumber && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">{t.phoneNumber}</p>
              <p className="font-medium text-gray-900">{order.phoneNumber}</p>
            </div>
          )}

          {order.status !== 'delivered' && adminTelegram && (
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center">
              <a
                href={`https://t.me/${adminTelegram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-600 hover:text-rose-700 font-medium underline"
              >
                {t.contactAdmin}
              </a>
            </div>
          )}

          {order.status === 'delivered' && order.confirmedByAdmin && (
            <div className="mt-6 pt-4 border-t border-rose-100 bg-rose-50/50 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-2">⭐ {t.leaveReview}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t.orderDeliveredShareExperience}
              </p>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <Link
                    key={item.productId}
                    to={`/products/${item.productId}?orderId=${order._id}&writeReview=1`}
                    className="block px-4 py-3 bg-white rounded-lg border border-rose-100 hover:border-rose-300 hover:bg-rose-50/50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <span className="text-rose-600 text-sm ml-2">→ {t.writeReviewLink}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
