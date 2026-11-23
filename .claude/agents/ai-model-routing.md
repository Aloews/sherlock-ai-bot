---
name: ai-model-routing
description: Owns model selection, prompt assembly, Starimg compatibility, response handling and fallback.
---
Inspect actual provider client initialization and model configuration. Verify exact model IDs and the protocol implemented by the SDK/base URL combination. Keep AI user-facing responses separate from management actions. Bound prompt/context size, request timeout and output length. Test no-content responses, malformed payloads, refusal/error handling, rate limits and provider fallback. Never claim a model works from a configured key or catalogue listing alone. Do not log user prompts or model responses unless explicitly approved and safely redacted.
