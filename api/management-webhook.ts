import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf } from 'telegraf';
import { parseGithubRepo, isAdmin, formatLogLine } from '../helpers/managementWebhook.js';

// Same management bot as the Railway long-polling version (bot.js), but as
// a Vercel webhook: Railway's outbound network to api.telegram.org turned
// out to be blocked (getMe()/getUpdates hung indefinitely with 0% CPU and
// 0 network activity — confirmed over several restart cycles), while this
// project's other bot already proves Vercel's outbound path works fine.
//
// The trade-off: Vercel's serverless Node runtime has no `git`, `vercel` or
// `supabase` binary available at request time, so every command below talks
// to a hosted REST API instead of shelling out to a local checkout — no
// persistent volume, no global CLI installs, nothing to keep alive.

const MANAGEMENT_BOT_TOKEN = process.env.MANAGEMENT_BOT_TOKEN;
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const GITHUB_REPO_URL = process.env.GITHUB_REPO_URL || 'https://github.com/Aloews/sherlock-scholes-';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
// Not secrets — Vercel project/team ids, defaulted to this deployment's own
// sherlock-scholes project so setup needs one less step. Override if it
// ever moves to a different project/team.
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_zPmwoDaqeK57VzUBzFxTJGMjUm65';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_e1o23XoY7tj0C19a4zwqDMhT';
const VERCEL_DEPLOY_HOOK_URL = process.env.VERCEL_DEPLOY_HOOK_URL;

// Deliberately NOT thrown at module scope: a module-level throw makes every
// request — including a plain GET health check — fail as an opaque 500 with
// nothing to read, which is exactly what happened on the first deploy. Fail
// per-request instead, saying which variable is missing.
const CONFIG_ERROR = !MANAGEMENT_BOT_TOKEN
  ? 'MANAGEMENT_BOT_TOKEN is not set on this Vercel project. Add it in Project Settings → Environment Variables, then redeploy (env changes need a new deployment to take effect).'
  : null;

const { owner: GITHUB_OWNER, repo: GITHUB_REPO } = parseGithubRepo(GITHUB_REPO_URL);

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': 'sherlock-management-bot',
    accept: 'application/vnd.github+json',
  };
  if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

function vercelHeaders(): Record<string, string> {
  return { authorization: `Bearer ${VERCEL_TOKEN}` };
}

async function fetchLatestCommit(): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=1`,
    { headers: githubHeaders() },
  );
  if (!res.ok) {
    throw new Error(`GitHub API вернул ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const [commit] = (await res.json()) as Array<{
    sha: string;
    commit: { message: string; author?: { name?: string; date?: string } };
  }>;
  if (!commit) return 'Коммитов не найдено.';
  const sha = commit.sha.slice(0, 7);
  const message = commit.commit.message.split('\n')[0];
  const author = commit.commit.author?.name ?? 'unknown';
  const date = commit.commit.author?.date ?? '';
  return `Последний коммит на GitHub (${GITHUB_OWNER}/${GITHUB_REPO}):\n${sha} — ${message}\n${author}, ${date}`;
}

async function triggerDeploy(): Promise<string> {
  if (!VERCEL_DEPLOY_HOOK_URL) {
    return 'VERCEL_DEPLOY_HOOK_URL не задан. Создайте Deploy Hook в Vercel: Project Settings → Git → Deploy Hooks.';
  }
  const res = await fetch(VERCEL_DEPLOY_HOOK_URL, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Deploy hook вернул ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json().catch(() => null)) as { job?: { id?: string } } | null;
  return `Деплой запущен.${body?.job?.id ? ` job: ${body.job.id}` : ''}`;
}

// Vercel's runtime-logs endpoint is a live tail, not a query over history —
// it only emits lines generated while this request is open. We read for a
// few seconds and return whatever showed up; right after a quiet period
// that can legitimately be nothing.
async function fetchRecentLogs(limit = 10): Promise<string> {
  if (!VERCEL_TOKEN) {
    return 'VERCEL_TOKEN не задан.';
  }

  const depRes = await fetch(
    `https://api.vercel.com/v7/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&limit=1&target=production`,
    { headers: vercelHeaders() },
  );
  if (!depRes.ok) {
    throw new Error(`Vercel deployments API вернул ${depRes.status}: ${(await depRes.text()).slice(0, 300)}`);
  }
  const depData = (await depRes.json()) as { deployments?: Array<{ uid: string }> };
  const deployment = depData.deployments?.[0];
  if (!deployment) return 'Деплоев не найдено.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const lines: string[] = [];
  let buffer = '';

  try {
    const logsRes = await fetch(
      `https://api.vercel.com/v1/projects/${VERCEL_PROJECT_ID}/deployments/${deployment.uid}/runtime-logs?teamId=${VERCEL_TEAM_ID}`,
      { headers: vercelHeaders(), signal: controller.signal },
    );
    if (!logsRes.ok || !logsRes.body) {
      throw new Error(`Vercel logs API вернул ${logsRes.status}`);
    }
    for await (const chunk of logsRes.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += Buffer.from(chunk).toString('utf8');
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) lines.push(formatLogLine(line));
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
  }

  if (lines.length === 0) {
    return `Свежих логов не было за последние 3с (деплой ${deployment.uid}). Это живой tail, не история — попробуйте вызвать команду сразу после реального трафика.`;
  }
  return lines.slice(-limit).join('\n');
}

// Empty-string fallback keeps construction side-effect-free when the token is
// missing; CONFIG_ERROR short-circuits the handler before any update reaches
// this instance, so it never actually talks to Telegram unconfigured.
const bot = new Telegraf(MANAGEMENT_BOT_TOKEN ?? '');

bot.use(async (ctx, next) => {
  if (!ctx.message || !('text' in ctx.message)) {
    return next();
  }
  if (!isAdmin(ctx, ADMIN_USER_IDS)) {
    await ctx.reply('Недостаточно прав');
    return;
  }
  return next();
});

bot.command('status', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    await ctx.reply(await fetchLatestCommit());
  } catch (err) {
    await ctx.reply(`Ошибка:\n${(err as Error).message}`);
  }
});

bot.command('pull', async (ctx) => {
  await ctx.reply(
    'Serverless-версия не держит локальный чекаут — "pull" не нужен: ' +
      '/deploy всегда собирает последний коммит с GitHub напрямую.',
  );
});

bot.command('deploy', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    await ctx.reply(await triggerDeploy());
  } catch (err) {
    await ctx.reply(`Ошибка деплоя:\n${(err as Error).message}`);
  }
});

bot.command('logs', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    await ctx.reply(`Логи Vercel:\n${await fetchRecentLogs()}`);
  } catch (err) {
    await ctx.reply(`Ошибка:\n${(err as Error).message}`);
  }
});

bot.command('db_push', async (ctx) => {
  await ctx.reply(
    'Применение миграций отключено в serverless-версии: файлы миграций в репозитории ' +
      'не содержат ту же временную метку, что и уже применённые версии в БД, поэтому ' +
      'надёжно сопоставить "какой файл — какая версия" отсюда нельзя — риск для продакшен-БД. ' +
      'Выполните вручную: supabase db push --db-url $SUPABASE_DB_URL',
  );
});

bot.on('text', async (ctx) => {
  await ctx.reply(
    'Доступные команды:\n' +
      '/status — последний коммит на GitHub\n' +
      '/deploy — запустить деплой на Vercel (Deploy Hook)\n' +
      '/logs — свежие логи Vercel (живой tail, несколько секунд)\n' +
      '/pull, /db_push — см. пояснение в самой команде',
  );
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (CONFIG_ERROR) {
    console.error('Management webhook misconfigured:', CONFIG_ERROR);
    // 200 on purpose for POST: Telegram retries and eventually disables a
    // webhook that keeps erroring, and a config problem won't fix itself on
    // retry. The GET health check is what surfaces the message to a human.
    res.status(req.method === 'POST' ? 200 : 500).send(CONFIG_ERROR);
    return;
  }

  if (req.method !== 'POST') {
    res.status(200).send('Management bot webhook is running');
    return;
  }

  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Management webhook error:', err);
    res.status(500).send('Error');
  }
}
