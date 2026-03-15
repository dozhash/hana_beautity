import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { retrieveLaunchParams } from '@tma.js/sdk';
import { getInitData } from '../lib/api';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
        };
        ready?: () => void;
        expand?: () => void;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
      };
    };
  }
}

interface TelegramUser {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface TelegramContextType {
  initData: string;
  user: TelegramUser | null;
  isReady: boolean;
}

const TelegramContext = createContext<TelegramContextType | null>(null);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => {
    if (typeof window === 'undefined') {
      return { initData: '', user: null, isReady: false };
    }
    let u: { id: number; username?: string; first_name?: string; last_name?: string } | undefined;
    try {
      const params = retrieveLaunchParams();
      const raw = params.tgWebAppData?.user ?? params.user;
      u = raw && typeof raw === 'object' && 'id' in raw && typeof (raw as { id: unknown }).id === 'number'
        ? (raw as { id: number; username?: string; first_name?: string; last_name?: string })
        : undefined;
    } catch {
      u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    }
    const user: TelegramUser | null = u
      ? {
          id: u.id,
          username: u.username,
          firstName: u.first_name,
          lastName: u.last_name,
        }
      : null;
    return {
      initData: getInitData(),
      user,
      isReady: true,
    };
  }, []);

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram(): TelegramContextType {
  const ctx = useContext(TelegramContext);
  if (!ctx) {
    return {
      initData: '',
      user: null,
      isReady: typeof window !== 'undefined',
    };
  }
  return ctx;
}
