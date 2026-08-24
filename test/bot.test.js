import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.MANAGEMENT_BOT_TOKEN = 'test-token';
process.env.ADMIN_USER_IDS = '111,222';
process.env.GITHUB_REPO_URL = 'https://github.com/Aloews/sherlock-scholes';
delete process.env.GITHUB_TOKEN;
delete process.env.VERCEL_TOKEN;

const { isAdmin, buildCloneUrl, formatError, formatOutput, vercelArgs, withTimeout } = await import('../bot.js');

test('isAdmin allows a listed admin id', () => {
  assert.equal(isAdmin({ from: { id: 111 } }), true);
});

test('isAdmin rejects an id not in the list', () => {
  assert.equal(isAdmin({ from: { id: 999 } }), false);
});

test('isAdmin rejects a message with no sender', () => {
  assert.equal(isAdmin({}), false);
});

test('buildCloneUrl returns the plain repo URL when no GITHUB_TOKEN is set', () => {
  assert.equal(buildCloneUrl(), 'https://github.com/Aloews/sherlock-scholes');
});

test('buildCloneUrl injects the token as basic auth when GITHUB_TOKEN is set', async () => {
  process.env.GITHUB_TOKEN = 'ghp_test123';
  const mod = await import(`../bot.js?with-token=${Date.now()}`);
  assert.equal(
    mod.buildCloneUrl(),
    'https://x-access-token:ghp_test123@github.com/Aloews/sherlock-scholes'
  );
  delete process.env.GITHUB_TOKEN;
});

test('vercelArgs passes args through unchanged when no VERCEL_TOKEN is set', () => {
  assert.deepEqual(vercelArgs('--prod', '--yes'), ['--prod', '--yes']);
});

test('vercelArgs appends --token when VERCEL_TOKEN is set', async () => {
  process.env.VERCEL_TOKEN = 'vercel-secret';
  const mod = await import(`../bot.js?with-vercel-token=${Date.now()}`);
  assert.deepEqual(mod.vercelArgs('--prod', '--yes'), ['--prod', '--yes', '--token', 'vercel-secret']);
  delete process.env.VERCEL_TOKEN;
});

test('formatOutput joins stdout and stderr', () => {
  assert.equal(formatOutput('out', 'err'), 'out\nerr');
});

test('formatOutput falls back to a placeholder when both streams are empty', () => {
  assert.equal(formatOutput('', ''), '(пусто)');
});

test('formatOutput truncates very long output', () => {
  const result = formatOutput('x'.repeat(4000), '');
  assert.ok(result.endsWith('... (truncated)'));
  assert.ok(result.length < 4000 + 30);
});

test('formatError concatenates stdout, stderr and message', () => {
  const result = formatError({ stdout: 'out', stderr: 'err', message: 'boom' });
  assert.equal(result, 'out\nerr\nboom');
});

test('formatError truncates very long errors', () => {
  const result = formatError({ message: 'x'.repeat(4000) });
  assert.ok(result.endsWith('... (truncated)'));
  assert.ok(result.length < 4000 + 30);
});

test('formatError redacts a leaked GITHUB_TOKEN from the error message', async () => {
  process.env.GITHUB_TOKEN = 'ghp_supersecret123';
  const mod = await import(`../bot.js?redact-github=${Date.now()}`);
  const result = mod.formatError({
    message: "Command failed: git clone https://x-access-token:ghp_supersecret123@github.com/Aloews/sherlock-scholes",
  });
  assert.ok(!result.includes('ghp_supersecret123'));
  assert.ok(result.includes('***REDACTED***'));
  delete process.env.GITHUB_TOKEN;
});

test('formatError redacts a leaked VERCEL_TOKEN from the error message', async () => {
  process.env.VERCEL_TOKEN = 'vercel-supersecret';
  const mod = await import(`../bot.js?redact-vercel=${Date.now()}`);
  const result = mod.formatError({
    message: 'Command failed: vercel --prod --yes --token vercel-supersecret',
  });
  assert.ok(!result.includes('vercel-supersecret'));
  assert.ok(result.includes('***REDACTED***'));
  delete process.env.VERCEL_TOKEN;
});

test('run() rejects clearly when the project was never cloned', async () => {
  process.env.PROJECT_PATH = '/nonexistent/path/for/tests';
  const mod = await import(`../bot.js?missing-project=${Date.now()}`);
  await assert.rejects(
    () => mod.run('git', ['status']),
    /Проект не найден по пути \/nonexistent\/path\/for\/tests/
  );
  delete process.env.PROJECT_PATH;
});

test('withTimeout resolves with the wrapped promise value when it settles first', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 1000, 'should not fire');
  assert.equal(result, 'ok');
});

test('withTimeout rejects with the timeout message when the promise never settles', async () => {
  const neverSettles = new Promise(() => {});
  await assert.rejects(
    () => withTimeout(neverSettles, 10, 'timed out for real'),
    /timed out for real/
  );
});

test('withTimeout propagates a rejection from the wrapped promise', async () => {
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('boom')), 1000, 'should not fire'),
    /boom/
  );
});
