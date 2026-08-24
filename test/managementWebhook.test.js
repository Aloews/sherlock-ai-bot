import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGithubRepo, isAdmin, formatLogLine } from '../helpers/managementWebhook.js';

test('parseGithubRepo extracts owner/repo from a plain URL', () => {
  assert.deepEqual(
    parseGithubRepo('https://github.com/Aloews/sherlock-scholes-'),
    { owner: 'Aloews', repo: 'sherlock-scholes-' },
  );
});

test('parseGithubRepo handles a trailing slash', () => {
  assert.deepEqual(
    parseGithubRepo('https://github.com/Aloews/sherlock-scholes-/'),
    { owner: 'Aloews', repo: 'sherlock-scholes-' },
  );
});

test('parseGithubRepo throws on a URL with no github.com owner/repo', () => {
  assert.throws(() => parseGithubRepo('https://example.com/not-github'));
});

test('isAdmin allows a listed admin id', () => {
  assert.equal(isAdmin({ from: { id: 111 } }, ['111', '222']), true);
});

test('isAdmin rejects an id not in the list', () => {
  assert.equal(isAdmin({ from: { id: 999 } }, ['111', '222']), false);
});

test('isAdmin rejects a message with no sender', () => {
  assert.equal(isAdmin({}, ['111']), false);
});

test('formatLogLine pretty-prints a JSON log entry', () => {
  assert.equal(
    formatLogLine('{"level":"error","message":"boom"}'),
    '[error] boom',
  );
});

test('formatLogLine defaults to info level when absent', () => {
  assert.equal(
    formatLogLine('{"message":"hello"}'),
    '[info] hello',
  );
});

test('formatLogLine returns the raw line when it is not JSON', () => {
  assert.equal(formatLogLine('plain text line'), 'plain text line');
});
