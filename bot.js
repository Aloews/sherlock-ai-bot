import 'dotenv/config';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Telegraf } from 'telegraf';

const execFileAsync = promisify(execFile);

const MANAGEMENT_BOT_TOKEN = process.env.MANAGEMENT_BOT_TOKEN;
const PROJECT_PATH = process.env.PROJECT_PATH || '/app/sherlock-scholes';
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_URL = process.env.GITHUB_REPO_URL || 'https://github.com/Aloews/sherlock-scholes';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

if (!MANAGEMENT_BOT_TOKEN) {
  throw new Error('MANAGEMENT_BOT_TOKEN is required');
}

if (ADMIN_USER_IDS.length === 0) {
  console.warn('Warning: ADMIN_USER_IDS is empty — no user will be able to use admin commands.');
}

function isAdmin(ctx) {
  const userId = ctx.from?.id?.toString();
  return !!userId && ADMIN_USER_IDS.includes(userId);
}

function buildCloneUrl() {
  if (!GITHUB_TOKEN) {
    return GITHUB_REPO_URL;
  }
  try {
    const url = new URL(GITHUB_REPO_URL);
    url.username = 'x-access-token';
    url.password = GITHUB_TOKEN;
    return url.toString();
  } catch {
    return GITHUB_REPO_URL;
  }
}

const SECRETS = [GITHUB_TOKEN, VERCEL_TOKEN, SUPABASE_DB_URL].filter(Boolean);

function redact(text) {
  return SECRETS.reduce((out, secret) => out.split(secret).join('***REDACTED***'), text);
}

async function ensureProjectCloned() {
  if (existsSync(PROJECT_PATH)) {
    return;
  }
  console.log(`Project not found at ${PROJECT_PATH}, cloning ${GITHUB_REPO_URL} ...`);
  try {
    await execFileAsync('git', ['clone', buildCloneUrl(), PROJECT_PATH]);
    console.log('Clone finished.');
  } catch (err) {
    console.error('Failed to clone project:', redact(err.message || String(err)));
  }
}

async function run(command, args, options = {}) {
  if (!existsSync(PROJECT_PATH)) {
    throw new Error(`Проект не найден по пути ${PROJECT_PATH} — клонирование не удалось при старте. Проверьте GITHUB_REPO_URL/GITHUB_TOKEN и перезапустите сервис.`);
  }
  return execFileAsync(command, args, {
    cwd: PROJECT_PATH,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

function vercelArgs(...args) {
  return VERCEL_TOKEN ? [...args, '--token', VERCEL_TOKEN] : args;
}

function formatError(err) {
  const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();
  const redacted = redact(output);
  return redacted.length > 3500 ? `${redacted.slice(0, 3500)}\n... (truncated)` : redacted;
}

function formatOutput(stdout, stderr) {
  const output = redact([stdout, stderr].filter(Boolean).join('\n').trim() || '(пусто)');
  return output.length > 3500 ? `${output.slice(0, 3500)}\n... (truncated)` : output;
}

const bot = new Telegraf(MANAGEMENT_BOT_TOKEN);

bot.use(async (ctx, next) => {
  if (!ctx.message || !('text' in ctx.message)) {
    return next();
  }
  if (!isAdmin(ctx)) {
    await ctx.reply('Недостаточно прав');
    return;
  }
  return next();
});

bot.command('status', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    const { stdout: statusOut } = await run('git', ['status', '--short']);
    const { stdout: logOut } = await run('git', ['log', '-1']);
    const short = statusOut.trim() || 'Нет изменений';
    await ctx.reply(`Статус:\n${short}\n\nПоследний коммит:\n${logOut.trim()}`);
  } catch (err) {
    await ctx.reply(`Ошибка:\n${formatError(err)}`);
  }
});

bot.command('pull', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    const { stdout, stderr } = await run('git', ['pull']);
    await ctx.reply(`git pull:\n${formatOutput(stdout, stderr)}`);
  } catch (err) {
    await ctx.reply(`Ошибка:\n${formatError(err)}`);
  }
});

bot.command('deploy', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    await ctx.reply('Запускаю деплой...');
    const { stdout, stderr } = await run('vercel', vercelArgs('--prod', '--yes'));
    await ctx.reply(`Деплой завершён:\n${formatOutput(stdout, stderr)}`);
  } catch (err) {
    await ctx.reply(`Ошибка деплоя:\n${formatError(err)}`);
  }
});

bot.command('logs', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    const { stdout, stderr } = await run('vercel', vercelArgs('logs', '--limit', '10'));
    await ctx.reply(`Логи Vercel:\n${formatOutput(stdout, stderr)}`);
  } catch (err) {
    await ctx.reply(`Ошибка:\n${formatError(err)}`);
  }
});

bot.command('db_push', async (ctx) => {
  if (!SUPABASE_DB_URL) {
    await ctx.reply('SUPABASE_DB_URL не задан.');
    return;
  }
  try {
    await ctx.replyWithChatAction('typing');
    await ctx.reply('Выполняю supabase db push...');
    const { stdout, stderr } = await run('supabase', ['db', 'push', '--db-url', SUPABASE_DB_URL]);
    await ctx.reply(`db push завершён:\n${formatOutput(stdout, stderr)}`);
  } catch (err) {
    await ctx.reply(`Ошибка:\n${formatError(err)}`);
  }
});

bot.on('text', async (ctx) => {
  await ctx.reply(
    'Доступные команды:\n' +
      '/status — статус git-репозитория\n' +
      '/pull — git pull\n' +
      '/deploy — деплой на Vercel\n' +
      '/logs — последние логи Vercel\n' +
      '/db_push — применить миграции Supabase'
  );
});

async function main() {
  await ensureProjectCloned();
  await bot.launch();
  console.log('Management bot started');
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  main().catch((err) => {
    console.error('Failed to start management bot:', err);
    process.exit(1);
  });
}

export { isAdmin, buildCloneUrl, formatError, formatOutput, vercelArgs, redact, run };
