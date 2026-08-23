import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

function createPlaylistCache(sourceUrl, cacheTtlMs) {
  let cache = null;

  return async function fetchPlaylist() {
    if (cache && Date.now() - cache.fetchedAt < cacheTtlMs) {
      return cache;
    }
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Upstream returned ${response.status}`);
      }
      const body = await response.text();
      const contentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';
      cache = { body, contentType, fetchedAt: Date.now() };
      return cache;
    } catch (err) {
      if (cache) {
        console.error('Playlist refresh failed, serving stale cache:', err.message);
        return cache;
      }
      throw err;
    }
  };
}

function isAuthorized(url, accessToken) {
  if (!accessToken) {
    return true;
  }
  return url.searchParams.get('token') === accessToken;
}

function createRequestHandler({ sourceUrl, accessToken, cacheTtlMs = 30_000 }) {
  const fetchPlaylist = createPlaylistCache(sourceUrl, cacheTtlMs);

  return async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (url.pathname === '/playlist.m3u8' || url.pathname === '/playlist.m3u') {
      if (!isAuthorized(url, accessToken)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      try {
        const playlist = await fetchPlaylist();
        res.writeHead(200, {
          'content-type': playlist.contentType,
          'cache-control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}`,
        });
        res.end(playlist.body);
      } catch (err) {
        console.error('Failed to fetch playlist:', err.message);
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('Upstream playlist unavailable');
      }
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  };
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const sourceUrl = process.env.M3U_SOURCE_URL;
  if (!sourceUrl) {
    throw new Error('M3U_SOURCE_URL is required');
  }

  const port = process.env.PORT || 8080;
  const handler = createRequestHandler({
    sourceUrl,
    accessToken: process.env.STREAM_ACCESS_TOKEN,
    cacheTtlMs: Number(process.env.PLAYLIST_CACHE_TTL_MS || 30_000),
  });

  createServer(handler).listen(port, () => {
    console.log(`Stream relay service started on port ${port}`);
  });
}

export { createRequestHandler, isAuthorized };
