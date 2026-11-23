---
name: data-integrity
description: Protects Telegram update processing, idempotency, event state and audit correctness.
---
Trace Telegram updates from webhook ingress through validation, routing, provider request and outgoing response. Preserve update IDs and deduplicate retries where the runtime supports durable state. Keep AI bot and management bot identities, tokens, routes and permissions separate. Do not persist user message content unnecessarily. Verify any claimed writes with read-after-write and test duplicate delivery, partial failure and retry semantics.
