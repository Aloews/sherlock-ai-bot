import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRequestHandler, isAuthorized } from '../server.js';

async function startHttpServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function startMockUpstream(body, { status = 200, contentType = 'application/vnd.apple.mpegurl' } = {}) {
  const server = createServer((req, res) => {
    res.writeHead(status, { 'content-type': contentType });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

test('isAuthorized allows any request when no token is configured', () => {
  const url = new URL('http://localhost/playlist.m3u8');
  assert.equal(isAuthorized(url, undefined), true);
});

test('isAuthorized rejects a missing or wrong token', () => {
  const url = new URL('http://localhost/playlist.m3u8');
  assert.equal(isAuthorized(url, 'secret'), false);
  const urlWrong = new URL('http://localhost/playlist.m3u8?token=nope');
  assert.equal(isAuthorized(urlWrong, 'secret'), false);
});

test('isAuthorized accepts the correct token', () => {
  const url = new URL('http://localhost/playlist.m3u8?token=secret');
  assert.equal(isAuthorized(url, 'secret'), true);
});

test('GET /healthz returns ok', async () => {
  const handler = createRequestHandler({ sourceUrl: 'http://unused.invalid' });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  } finally {
    server.close();
  }
});

test('GET /playlist.m3u8 relays the upstream playlist body and content-type', async () => {
  const body = '#EXTM3U\n#EXTINF:-1,Channel 1\nhttp://example.com/ch1.m3u8\n';
  const upstream = await startMockUpstream(body);
  const handler = createRequestHandler({ sourceUrl: upstream.url, cacheTtlMs: 0 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/vnd.apple.mpegurl');
    assert.equal(await res.text(), body);
  } finally {
    server.close();
    upstream.server.close();
  }
});

test('GET /playlist.m3u8 returns 403 when token is required and missing', async () => {
  const upstream = await startMockUpstream('#EXTM3U\n');
  const handler = createRequestHandler({ sourceUrl: upstream.url, accessToken: 'secret', cacheTtlMs: 0 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8`);
    assert.equal(res.status, 403);
  } finally {
    server.close();
    upstream.server.close();
  }
});

test('GET /playlist.m3u8 returns 200 when the correct token is provided', async () => {
  const upstream = await startMockUpstream('#EXTM3U\n');
  const handler = createRequestHandler({ sourceUrl: upstream.url, accessToken: 'secret', cacheTtlMs: 0 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8?token=secret`);
    assert.equal(res.status, 200);
  } finally {
    server.close();
    upstream.server.close();
  }
});

test('GET /playlist.m3u8 returns 502 when upstream is down and no cache exists', async () => {
  const handler = createRequestHandler({ sourceUrl: 'http://127.0.0.1:1', cacheTtlMs: 0 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});

test('unknown route returns 404', async () => {
  const handler = createRequestHandler({ sourceUrl: 'http://unused.invalid' });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
