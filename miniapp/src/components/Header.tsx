import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { t } from '../lib/translations';
import logo from '../assets/hana-beauty-logo.png';

export function Header() {
  const { cartItems } = useCart();
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200" style={{ backgroundColor: '#fbf4ef' }}>
      <div className="flex items-center justify-between h-14 px-4 max-w-4xl mx-auto gap-2">
        <Link to="/products" className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <img
            src={logo}
            alt="Hana Beauty"
            className="w-9 h-9 rounded-full object-contain shrink-0"
          />
          Hana Beauty
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/cart"
            className="relative p-2 text-gray-700 hover:text-rose-600 transition-colors"
            aria-label={t.viewCart}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
              />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-xs font-semibold text-white bg-rose-600 rounded-full">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
