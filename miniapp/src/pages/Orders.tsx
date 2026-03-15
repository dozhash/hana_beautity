import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, captureInitData } from '../lib/api';
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

const PENDING_STATUSES = ['pending', 'paid', 'preparing', 'shipped'];

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);
  const [adminTelegram, setAdminTelegram] = useState<string | null>(null);

  const loadOrders = (retryCount = 0, showLoading = false) => {
    if (retryCount > 0 || showLoading) setLoading(true);
    captureInitData();
    api
      .get<Order[]>('/api/orders/me')
      .then((res) => {
        setOrders(res.data ?? []);
        setAuthFailed(false);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          if (retryCount < 2) {
            captureInitData();
            setTimeout(() => loadOrders(retryCount + 1), 300 * (retryCount + 1));
            return;
          }
          setAuthFailed(true);
        }
        setOrders([]);
        setLoading(false);
      });
  };

  const handleRefresh = () => {
    loadOrders(0, true);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const hasPending = orders.some((o) => PENDING_STATUSES.includes(o.status));
    if (hasPending) {
      api.get<{ adminTelegram: string | null }>('/api/config').then((res) => {
        if (res.data?.adminTelegram) setAdminTelegram(res.data.adminTelegram);
      }).catch(() => {});
    }
  }, [orders]);

  const requestConfirm = (e: React.MouseEvent, orderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    api
      .post(`/api/orders/${orderId}/confirm-received`)
      .then(() => {
        setOrders((prev) =>
          prev.map((o) =>
            o._id === orderId ? { ...o, confirmedByAdmin: true } : o
          )
        );
      })
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">{t.loadingOrders}</p>
        </div>
      </div>
    );
  }

  if (authFailed) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24 flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.myOrders}</h1>
        <p className="text-gray-600 mb-6 text-center">
          {t.openFromTelegram}
        </p>
        <Link
          to="/products"
          className="px-6 py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors"
        >
          {t.browseProducts}
        </Link>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24 flex flex-col items-center justify-center">
        <p className="text-gray-600 mb-6">{t.noOrdersYet}</p>
        <Link
          to="/products"
          className="px-6 py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors"
        >
          {t.browseProducts}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.myOrders}</h1>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleRefresh();
          }}
          disabled={loading}
          className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 touch-manipulation active:bg-gray-300"
          aria-label={t.refreshOrders}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
      </div>
      <div className="space-y-4">
        {orders.map((order) => {
          const badge = getStatusBadge(order.status, t);
          return (
            <Link
              key={order._id}
              to={`/orders/${order._id}`}
              className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-gray-900">
                  {t.orderNumberLabel} #{order.orderNumber ?? order._id.slice(-6)}
                </span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {t.total}: {formatPrice(order.totalPrice)} ·{' '}
                {new Date(order.createdAt).toLocaleDateString('uz-UZ', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-medium text-gray-700">{t.products}:</p>
                {order.items.map((item) => (
                  <p key={item.productId}>
                    {item.name} ×{item.quantity}
                  </p>
                ))}
              </div>
              {order.status === 'delivered' && !order.confirmedByAdmin && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={(e) => requestConfirm(e, order._id)}
                    className="px-4 py-2 bg-rose-100 text-rose-700 text-sm font-medium rounded-lg hover:bg-rose-200"
                  >
                    {t.receivedOrder}
                  </button>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {adminTelegram && orders.some((o) => PENDING_STATUSES.includes(o.status)) && (
        <div className="mt-8 flex justify-center w-full">
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
    </div>
  );
}
