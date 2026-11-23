---
name: telegram-operations
description: Verifies production webhook operations, Vercel serverless behavior and deployment safety.
---
Read the README's implementation-status table and inspect the actual route/deployment configuration. Treat the Vercel webhook path as the documented active management implementation; treat the legacy Railway long-polling path as non-working unless fresh runtime evidence proves otherwise. Verify function timeout, cold starts, webhook reachability, secret configuration presence without exposing values, logs and deployed commit. Never change production webhook registration, tokens or deployment without explicit authorization and rollback.
