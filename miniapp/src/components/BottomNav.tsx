import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { t } from '../lib/translations';

const navConfig: Array<{ to: string; labelKey: 'navProducts' | 'navCart' | 'navOrders'; icon: string; showBadge?: boolean }> = [
  { to: '/products', labelKey: 'navProducts', icon: '🏠' },
  { to: '/cart', labelKey: 'navCart', icon: '🛒', showBadge: true },
  { to: '/orders', labelKey: 'navOrders', icon: '📦' },
];

export function BottomNav() {
  const location = useLocation();
  const { cartItems } = useCart();
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16">
        {navConfig.map(({ to, labelKey, icon, showBadge = false }) => {
          const label = t[labelKey] as string;
          const isActive = location.pathname === to || (to === '/products' && location.pathname.startsWith('/products'));
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive ? 'text-rose-600' : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-label={label}
            >
              <span className="relative text-xl">
                {icon}
                {showBadge && cartCount > 0 && (
                  <span className="absolute -top-2 -right-3 min-w-[1rem] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-rose-600 rounded-full">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </span>
              <span className="text-xs mt-0.5 font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
