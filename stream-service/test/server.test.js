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

// ─── Сжатие каталога ────────────────────────────────────────────────────────
//
// Боевой каталог — 824 КБ, и отдавался он БЕЗ СЖАТИЯ: заголовка
// `content-encoding` в ответе не было вовсе, `Accept-Encoding: gzip`
// игнорировался. Замер по боевому телу: 824 343 → 172 835 байт, в 4.8 раза.
// Снаружи эта разница выглядит как «ТВ не работает»: на медленном канале
// экран молчит секунды, пока едет список.

test('GET /playlist.m3u8 сжимает, когда клиент просит gzip', async () => {
  const body = '#EXTM3U\n' + '#EXTINF:-1,Channel\nhttp://example.com/ch.m3u8\n'.repeat(400);
  const upstream = await startMockUpstream(body);
  const handler = createRequestHandler({ sourceUrl: upstream.url, cacheTtlMs: 60_000 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8`, {
      headers: { 'accept-encoding': 'gzip, deflate' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    // Сжатое тело обязано быть ЗАМЕТНО меньше исходного, иначе «сжатие» есть
    // только в заголовке. Повторяющийся M3U жмётся в разы, а не на проценты.
    assert.ok(Number(res.headers.get('content-length')) < body.length / 2,
      'gzip-тело должно быть меньше половины исходного');
    // fetch распакует сам — содержимое обязано совпасть побайтно.
    assert.equal(await res.text(), body);
  } finally {
    server.close();
    upstream.server.close();
  }
});

// ⚠️ ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ. Без него проверка выше «пройдёт» и у сервера,
// который жмёт ВСЕГДА, — а такой сервер отдаст двоичный мусор клиенту, не
// умеющему распаковывать. Именно это ломает часть HLS-плееров и прокси.
test('GET /playlist.m3u8 НЕ сжимает, когда клиент не просил', async () => {
  const body = '#EXTM3U\n' + '#EXTINF:-1,Channel\nhttp://example.com/ch.m3u8\n'.repeat(400);
  const upstream = await startMockUpstream(body);
  const handler = createRequestHandler({ sourceUrl: upstream.url, cacheTtlMs: 60_000 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8`, {
      headers: { 'accept-encoding': 'identity' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-encoding'), null);
    assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(body));
    assert.equal(await res.text(), body);
  } finally {
    server.close();
    upstream.server.close();
  }
});

// Без `vary` общий кэш отдаст сжатый ответ тому, кто сжатие не просил.
test('GET /playlist.m3u8 объявляет vary: accept-encoding', async () => {
  const upstream = await startMockUpstream('#EXTM3U\n');
  const handler = createRequestHandler({ sourceUrl: upstream.url, cacheTtlMs: 60_000 });
  const { server, baseUrl } = await startHttpServer(handler);
  try {
    const res = await fetch(`${baseUrl}/playlist.m3u8`);
    assert.match(res.headers.get('vary') || '', /accept-encoding/i);
    await res.text();
  } finally {
    server.close();
    upstream.server.close();
  }
});
