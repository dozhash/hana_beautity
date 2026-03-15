import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, API_BASE, getInitData, captureInitData } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useTelegram } from '../context/TelegramContext';
import { t, formatPrice } from '../lib/translations';
import { retrieveLaunchParams } from '@tma.js/sdk';

function validatePhone(
  value: string,
  t: { phoneRequired: string; phoneFormatError: string; phoneLengthError: string; invalidPhone: string }
): { valid: boolean; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: t.phoneRequired };
  }
  if (!/^\+?[0-9]+$/.test(trimmed)) {
    return { valid: false, error: t.phoneFormatError };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) {
    return { valid: false, error: t.phoneLengthError };
  }
  return { valid: true };
}

export function Cart() {
  const { cartItems, updateQuantity, removeFromCart, clearCart, showToast } =
    useCart();
  const { user } = useTelegram();
  const [checkingOut, setCheckingOut] = useState(false);
  const [step, setStep] = useState<'cart' | 'phone'>('cart');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [lastOrderNumber, setLastOrderNumber] = useState<number | null>(null);
  const [adminTelegram, setAdminTelegram] = useState<string | null>(null);

  useEffect(() => {
    if (!lastOrderNumber) return;
    api.get<{ adminTelegram: string | null }>('/api/config').then((res) => {
      if (res.data?.adminTelegram) setAdminTelegram(res.data.adminTelegram);
    }).catch(() => {});
  }, [lastOrderNumber]);

  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const handleCheckout = () => {
    setStep('phone');
    setPhoneError('');
    setPhone('');
  };

  const handlePlaceOrder = async () => {
    const { valid, error } = validatePhone(phone, t);
    if (!valid) {
      setPhoneError(error ?? t.invalidPhone);
      return;
    }

    let tgUser: { id: number; username?: string } | undefined;
    try {
      const params = retrieveLaunchParams();
      const raw = params.tgWebAppData?.user ?? params.user;
      tgUser = raw && typeof raw === 'object' && 'id' in raw && typeof (raw as { id: unknown }).id === 'number'
        ? (raw as { id: number; username?: string })
        : undefined;
    } catch {
      tgUser = typeof window !== 'undefined' ? (window.Telegram?.WebApp as { initDataUnsafe?: { user?: { id: number; username?: string } } })?.initDataUnsafe?.user : undefined;
    }
    const telegramUserId = tgUser?.id ?? user?.id;

    if (!telegramUserId) {
      console.warn('[Telegram WebApp] User not detected.');
    }

    setPhoneError('');
    setCheckingOut(true);
    try {
      captureInitData();
      const initData = getInitData();
      const items = cartItems.map(({ productId, name, price, quantity }) => ({
        productId,
        name,
        price,
        quantity,
      }));
      const res = await api.post<{ orderNumber: number }>('/api/orders', {
        userId: telegramUserId ?? undefined,
        telegramUsername: tgUser?.username ?? user?.username,
        phoneNumber: phone.trim(),
        items,
        totalPrice: total,
        ...(initData && { initData }),
      });
      setLastOrderNumber(res.data.orderNumber);
      clearCart();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg ?? t.failedToPlaceOrder);
    } finally {
      setCheckingOut(false);
    }
  };

  const handleBackToCart = () => {
    setStep('cart');
    setPhoneError('');
  };

  if (cartItems.length === 0 && !lastOrderNumber) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
        <p className="text-gray-600 mb-6">{t.cartEmpty}</p>
        <Link
          to="/products"
          className="px-6 py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors"
        >
          {t.browseProducts}
        </Link>
      </div>
    );
  }

  if (cartItems.length === 0 && lastOrderNumber) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">{t.orderSuccessful} 🎉</h1>
        <p className="text-gray-600 mb-2">{t.yourOrderNumber}:</p>
        <p className="text-2xl font-bold text-rose-600 mb-2">#{lastOrderNumber}</p>
        <p className="text-gray-500 text-sm mb-8">{t.weWillContactYou}</p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Link
            to="/orders"
            className="px-6 py-3 border-2 border-rose-600 text-rose-600 font-semibold rounded-xl hover:bg-rose-50 transition-colors text-center"
          >
            {t.viewOrders}
          </Link>
          <Link
            to="/products"
            className="px-6 py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors text-center"
          >
            {t.continueShopping}
          </Link>
        </div>
        {adminTelegram && (
          <a
            href={`https://t.me/${adminTelegram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-rose-600 hover:text-rose-700 font-medium underline"
          >
            {t.contactAdmin}
          </a>
        )}
      </div>
    );
  }

  if (step === 'phone') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24">
        <button
          type="button"
          onClick={handleBackToCart}
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
          {t.backToCart}
        </button>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.checkout}</h1>
        <p className="text-gray-600 mb-6">{t.enterPhoneToComplete}</p>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
            {t.phoneNumber} <span className="text-rose-500">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError('');
            }}
            placeholder={t.phonePlaceholder}
            className={`w-full px-4 py-3 border rounded-xl text-base focus:ring-2 focus:ring-rose-500 focus:border-rose-500 ${
              phoneError ? 'border-red-500' : 'border-gray-300'
            }`}
            inputMode="tel"
            autoComplete="tel"
          />
          {phoneError && (
            <p className="mt-2 text-sm text-red-600">{phoneError}</p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {t.digitsOnlyHint}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleBackToCart}
              className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
            >
              {t.back}
            </button>
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={checkingOut}
              className="flex-1 py-3 px-4 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingOut ? t.processing : t.placeOrder}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-40">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.navCart}</h1>

      <ul className="space-y-4">
        {cartItems.map((item) => (
          <li
            key={item.productId}
            className="bg-white rounded-xl shadow-sm overflow-hidden flex gap-4 p-4"
          >
            <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
              {item.image ? (
                <img
                  src={item.image.startsWith('/') ? `${API_BASE}${item.image}` : item.image}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1}
                    stroke="currentColor"
                    className="w-8 h-8"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-medium text-gray-900 truncate">{item.name}</h2>
              <p className="text-rose-600 font-semibold mt-1">
                {formatPrice(item.price * item.quantity)}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.productId, -1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium"
                  aria-label={t.decreaseQuantity}
                >
                  −
                </button>
                <span className="w-8 text-center font-medium">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.productId, 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium"
                  aria-label={t.increaseQuantity}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.productId)}
                  className="ml-auto text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  {t.remove}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="fixed left-0 right-0 bottom-16 z-40 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">{t.total}</p>
            <p className="text-xl font-bold text-gray-900">
              {formatPrice(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCheckout}
            className="px-8 py-3 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700 transition-colors"
          >
            {t.checkout}
          </button>
        </div>
      </div>
    </div>
  );
}
