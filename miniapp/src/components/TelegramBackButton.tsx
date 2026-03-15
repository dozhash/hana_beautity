import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Syncs the Telegram header back button with in-app navigation.
 * When visible, clicking it navigates back instead of closing the app.
 */
export function TelegramBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  const isRootOrProducts = location.pathname === '/' || location.pathname === '/products';

  useEffect(() => {
    const BackButton = typeof window !== 'undefined' && window.Telegram?.WebApp?.BackButton;
    if (!BackButton) return;

    const handleBack = () => {
      navigate(-1);
    };

    BackButton.onClick(handleBack);

    if (isRootOrProducts) {
      BackButton.hide();
    } else {
      BackButton.show();
    }

    return () => {
      BackButton.offClick(handleBack);
      BackButton.hide();
    };
  }, [isRootOrProducts, navigate]);

  return null;
}
