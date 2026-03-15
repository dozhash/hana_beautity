import axios from 'axios';
import { retrieveRawInitData } from '@tma.js/sdk';

export const API_BASE = import.meta.env.VITE_API_URL || '';

const INIT_DATA_KEY = 'tg_init_data';

function persistInitData(data: string): void {
  try {
    sessionStorage.setItem(INIT_DATA_KEY, data);
    localStorage.setItem(INIT_DATA_KEY, data);
  } catch {
    /* ignore */
  }
}

/** Persist init data so future requests (interceptor) can use it */
export function storeInitData(data: string): void {
  if (data) persistInitData(data);
}

function readInitDataFromUrl(): string {
  const hash = window.location.hash?.slice(1) || '';
  const search = window.location.search?.slice(1) || '';
  const params = new URLSearchParams(hash || search);
  const fromParams = params.get('tgWebAppData') || params.get('initData') || '';
  if (fromParams) return fromParams;
  if ((hash || search).includes('auth_date=')) {
    const val = hash.split('tgWebAppData=')[1]?.split('&')[0];
    if (val) {
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
    return (hash || search) || '';
  }
  return '';
}

/**
 * Capture init data at launch - it lives in the URL hash and is lost on navigation.
 * Uses @tma.js/sdk first (most reliable), then fallbacks.
 */
export function captureInitData(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromTma = retrieveRawInitData();
    if (fromTma) {
      persistInitData(fromTma);
      return fromTma;
    }
  } catch {
    /* SDK may throw if not in TMA env */
  }
  const tg = window.Telegram?.WebApp;
  const fromSdk = tg?.initData || '';
  const fromUrl = readInitDataFromUrl();
  const fromSession = sessionStorage.getItem(INIT_DATA_KEY) || '';
  const fromLocal = localStorage.getItem(INIT_DATA_KEY) || '';
  const data = fromSdk || fromUrl || fromSession || fromLocal;
  if (data) {
    persistInitData(data);
    return data;
  }
  return fromLocal || fromSession;
}

export function getInitData(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromTma = retrieveRawInitData();
    if (fromTma) return fromTma;
  } catch {
    /* SDK may throw if not in TMA env */
  }
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) return tg.initData;
  const fromUrl = readInitDataFromUrl();
  if (fromUrl) return fromUrl;
  return sessionStorage.getItem(INIT_DATA_KEY) || localStorage.getItem(INIT_DATA_KEY) || '';
}

let initDataProvider: () => string = getInitData;

export function setInitDataProvider(fn?: () => string) {
  initDataProvider = fn ?? getInitData;
}

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const initData = initDataProvider();
  if (initData) {
    config.headers['X-Telegram-Init-Data'] = initData;
  }
  return config;
});
