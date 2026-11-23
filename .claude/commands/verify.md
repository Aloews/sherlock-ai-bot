# Verify Sherlock AI Bot task

1. Read AGENTS.md, CLAUDE.md, README.md and package.json.
2. Map AI bot and management bot routes/tokens independently.
3. Record exact HEAD and changed paths.
4. Run npm run typecheck and npm test.
5. Test webhook parsing, secret validation, duplicate delivery and management authorization.
6. Verify provider protocol/model config without printing secrets.
7. Inspect exact-head CI and deployed SHA where deployment is claimed.
8. Report PASS only with evidence; otherwise PARTIAL/BLOCKED.
Never change production webhook configuration or trigger paid calls without authorization.
