import { Request, Response, NextFunction } from 'express';
import { validate, parse } from '@tma.js/init-data-node';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface AuthenticatedRequest extends Request {
  telegramUser?: TelegramUser;
}

/**
 * Validates Telegram WebApp initData and attaches user to request.
 * Use X-Telegram-Init-Data header or initData query/body param.
 */
export function requireTelegramAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const initData =
    req.headers['x-telegram-init-data'] ??
    req.query.initData ??
    req.body?.initData;

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!initData || typeof initData !== 'string') {
    res.status(401).json({ error: 'Missing Telegram init data' });
    return;
  }

  if (!token) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  try {
    validate(initData, token);
    const parsed = parse(initData);
    req.telegramUser = parsed.user as TelegramUser;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Telegram init data' });
  }
}

/**
 * Optional auth - attaches user if valid initData present, otherwise continues.
 */
export function optionalTelegramAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const initData =
    req.headers['x-telegram-init-data'] ??
    req.query.initData ??
    req.body?.initData;

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!initData || typeof initData !== 'string' || !token) {
    next();
    return;
  }

  try {
    validate(initData, token);
    const parsed = parse(initData);
    req.telegramUser = parsed.user as TelegramUser;
  } catch {
    // ignore
  }
  next();
}
