// Pure helpers for api/management-webhook.ts, kept in plain JS so they can
// be unit-tested with node:test directly, no TypeScript build step needed.

export function parseGithubRepo(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)\/?$/);
  if (!match) {
    throw new Error(`Cannot parse owner/repo from GITHUB_REPO_URL: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

export function isAdmin(ctx, adminUserIds) {
  const userId = ctx.from?.id?.toString();
  return !!userId && adminUserIds.includes(userId);
}

export function formatLogLine(raw) {
  try {
    const entry = JSON.parse(raw);
    return `[${entry.level ?? 'info'}] ${entry.message ?? raw}`;
  } catch {
    return raw;
  }
}
