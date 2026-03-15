import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database.js';
import { indexRouter } from './routes/index.js';
import { startTelegramBot } from './bot/telegramBot.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
  exposedHeaders: ['X-Telegram-Init-Data'],
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api', indexRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  try {
    await connectDB();
    await startTelegramBot();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
