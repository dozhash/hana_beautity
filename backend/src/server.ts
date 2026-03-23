import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database.js';
import { indexRouter } from './routes/index.js';
import {
  startTelegramBot,
  WEBHOOK_PATH,
  getWebhookHandler,
  setupWebhook,
  deleteWebhook,
  shouldUsePolling,
} from './bot/telegramBot.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
  exposedHeaders: ['X-Telegram-Init-Data'],
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Telegram webhook - must be before catch-all routes, receives POST from Telegram
app.post(WEBHOOK_PATH, getWebhookHandler());

// Routes
app.use('/api', indexRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function gracefulShutdown(server: ReturnType<typeof app.listen>, signal: string): Promise<void> {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  if (!shouldUsePolling()) {
    try {
      await deleteWebhook();
    } catch (err) {
      console.warn('deleteWebhook failed during shutdown:', err);
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}

// Start server
async function start() {
  try {
    await connectDB();
    await startTelegramBot();

    const server = app.listen(PORT, async () => {
      console.log(`Server running on http://localhost:${PORT}`);

      const usePolling = shouldUsePolling();
      if (usePolling) {
        console.log('[Local] Polling mode active — skipping webhook setup (expected in dev)');
      } else {
        console.log('[Production] Setting up webhook...');
        try {
          await setupWebhook();
        } catch (err) {
          console.error('Webhook setup failed (check domain/port):', err);
        }
      }
    });

    process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
