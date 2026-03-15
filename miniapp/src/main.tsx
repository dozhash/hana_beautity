import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { TelegramProvider } from './context/TelegramContext'
import { captureInitData } from './lib/api'
import './index.css'
import App from './App.tsx'

function initTelegramWebApp() {
  if (typeof window === 'undefined') return;
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready?.();
    tg.expand?.();
  }
  captureInitData();
  setTimeout(captureInitData, 100);
  setTimeout(captureInitData, 300);
  setTimeout(captureInitData, 800);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTelegramWebApp);
  } else {
    initTelegramWebApp();
  }
}

function AppWithApi() {
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TelegramProvider>
      <BrowserRouter>
        <CartProvider>
          <AppWithApi />
        </CartProvider>
      </BrowserRouter>
    </TelegramProvider>
  </StrictMode>,
)
