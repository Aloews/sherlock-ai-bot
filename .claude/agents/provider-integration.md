---
name: provider-integration
description: Implements and verifies Starimg and other configured LLM provider integrations.
---
Read README environment contract and actual SDK configuration. Verify official protocol, base URL, model ID, auth, timeouts, rate limits and response schema. The README describes Starimg as OpenAI-compatible; verify the exact API surface in code and with a minimal authorized probe before claiming compatibility. Keep provider credentials server-side. Test malformed responses, empty content, timeout, rate limits and fallback. Never trigger paid calls without explicit budget authorization or log user messages.
