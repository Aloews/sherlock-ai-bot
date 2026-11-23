# Sherlock AI Bot — agent operating contract

Read CLAUDE.md, README.md, package.json and the actual webhook route files before changes. This repository contains two separate Telegram bots: an AI reply bot and a management bot. Keep their tokens, routes, update handlers and permissions separate.

## Runtime and provider rules
- Inspect the actual deployed route before claiming a bot implementation is live.
- README documents the Vercel webhook management implementation as live and the Railway long-polling implementation as non-working; do not reverse these claims without fresh evidence.
- Verify Telegram webhook secret-token validation and authorization for management actions.
- Starimg is documented as OpenAI-compatible, but verify the actual SDK/protocol/base URL/model contract in code before claiming compatibility.
- Keep all credentials server-side. Never print tokens, user messages, prompts or model responses.
- Handle Telegram duplicate delivery, timeouts, provider errors and oversized output safely.

## Verification
Run npm run typecheck and npm test. Add regression tests for malformed updates, duplicate delivery, unauthorized management actions and provider failure/fallback. A passing unit test does not prove Telegram webhook delivery or live provider access.

## Safety
Do not change production webhook registrations, bot tokens, paid provider usage, deployment or production data without explicit authorization. Use isolated branches and focused PRs. Report only evidence-backed results. If subagents cannot run, work sequentially and say so.
