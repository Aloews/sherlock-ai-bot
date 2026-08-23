import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.MANAGEMENT_BOT_TOKEN = 'test-token';
process.env.ADMIN_USER_IDS = '111,222';
process.env.GITHUB_REPO_URL = 'https://github.com/Aloews/sherlock-scholes';
delete process.env.GITHUB_TOKEN;

const { isAdmin, buildCloneUrl, formatError, formatOutput } = await import('../bot.js');

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
