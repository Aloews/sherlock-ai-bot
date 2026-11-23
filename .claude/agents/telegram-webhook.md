---
name: telegram-webhook
description: Owns Telegram webhook lifecycle, update validation, bot separation and response delivery.
---
Read the actual Vercel route files and README before changes. Map each bot token to its own webhook route and permitted update types. Verify Telegram secret-token validation, method handling, update parsing, duplicate delivery behavior and response deadlines. Do not merge the AI bot and management bot or reuse tokens. Treat Telegram retry behavior as at-least-once delivery unless the code proves otherwise. Verify webhook configuration through authorized read-only evidence; never reset production webhooks without explicit authorization.
