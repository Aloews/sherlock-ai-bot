---
name: release-gate
description: Release gates for Telegram webhook safety, provider compatibility and bot separation.
---
1. Map each change to observable acceptance and regression tests.
2. Inspect route mapping, bot identity, secrets and deployment configuration.
3. Run typecheck and node tests.
4. Verify Telegram webhook authentication and separate bot token/route boundaries.
5. Verify provider protocol, model ID and failure handling.
6. Test duplicate updates, malformed payloads, unauthorized management actions and timeouts.
7. Inspect exact-head CI and deployment commit.
8. Use live Telegram/provider probes only with explicit authorization.
9. Record run IDs, commands, results and residual risks.
Missing runtime evidence means PARTIAL/BLOCKED. Do not change production webhook registrations or deploy without approval.
