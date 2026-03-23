# Telegram Bot Webhook Setup

The bot uses **webhooks** in production (Railway, Render, etc.) and **polling** for local development.

## Production (Railway)

1. **Environment variables** (Railway sets these automatically):
   - `TELEGRAM_BOT_TOKEN` – your bot token
   - `PORT` – provided by Railway
   - `RAILWAY_PUBLIC_DOMAIN` – set when public networking is enabled (e.g. `your-app.up.railway.app`)

2. **Optional**: If you use a custom domain or different host:
   - Set `WEBHOOK_DOMAIN=https://your-custom-domain.com`

3. On deploy, the server will:
   - Register the webhook at `https://{domain}/telegram/webhook-v3k9x2p7`
   - Log success/failure of webhook registration

## Local Development

- **Polling mode**: When `NODE_ENV=development` and `RAILWAY_PUBLIC_DOMAIN` is unset, the bot uses long polling.
- Run: `npm run dev`
- The bot will receive updates via polling; no webhook setup needed.

## Testing Webhook Locally (optional)

To test webhooks locally:

1. Expose your local server (e.g. with ngrok):
   ```bash
   ngrok http 5000
   ```
2. Set:
   - `WEBHOOK_DOMAIN=https://your-ngrok-url.ngrok.io`
   - `RAILWAY_PUBLIC_DOMAIN=` (empty) – so the app thinks it’s not in development
   - Or set `NODE_ENV=production` and `WEBHOOK_DOMAIN=...`

## Graceful Shutdown

On `SIGTERM`/`SIGINT`, the server:
- Stops accepting new connections
- Deletes the webhook (production)
- Exits cleanly

This reduces 409 Conflict errors when Railway restarts the service.
