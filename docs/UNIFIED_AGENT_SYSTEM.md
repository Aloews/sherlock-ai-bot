# Unified engineering agents — Sherlock AI Bot

The `.claude/` specialist agents supplement `AGENTS.md`, `CLAUDE.md` and `README.md`.

## Roles
- `engineering-lead`: scope, coordination and evidence-based delivery.
- `telegram-webhook`: webhook lifecycle, update validation and bot separation.
- `ai-model-routing`: Starimg/provider protocol, model IDs and fallback.
- `telegram-operations`: Vercel webhook runtime and deployment verification.
- `backend-engineer`: TypeScript handlers and serverless APIs.
- `provider-integration`: external model APIs.
- `data-integrity`: update idempotency and event processing.
- `security-reviewer`: tokens, admin authorization and secrets.
- `qa-adversarial`: independent webhook/provider failure testing.

Skills: `reality-first`, `release-gate`, `agent-handoff`.
Commands: `/verify`, `/finish-task`, `/security-gate`.
Dispatch: `/dispatch` (launches named specialist subagents when the Claude Code runtime exposes the Task tool; otherwise requires sequential work).

Run `python3 scripts/validate_agent_system.py`. Structural validation does not prove live Telegram delivery or provider access.
