# Agent operating instructions

Before changing this repository, read the portable [Reality-First Autonomous Engineering skill](.agents/skills/reality-first-autonomous-engineering/SKILL.md) and its security/cost reference.

This repository contains separate Telegram bots and deployment paths. Inspect the exact entrypoint, webhook/long-polling mode, environment variables, and live deployment before changing anything. Do not merge the AI conversation bot with the management bot or assume a nonworking Railway long-polling implementation is production-active. Preserve the configured Starimg gateway and never expose bot tokens or provider keys.

The skill defines the execution process; it does not grant permissions, override product constraints, or authorize paid resources, destructive changes, production data changes, or releases. Validate the actual Telegram webhook flow and provider integration where credentials and safe test conditions permit.

Do not send routine progress narration. Escalate only a material decision, genuine blocker, security/cost risk, or final evidence-based handoff.
