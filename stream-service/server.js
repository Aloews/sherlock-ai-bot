import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

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
      // ⚠️ СЖИМАЕМ ОДИН РАЗ НА ОБНОВЛЕНИЕ, А НЕ НА ЗАПРОС. Каталог — 824 КБ,
      // и gzip по нему стоит десятки миллисекунд процессора. На запрос это
      // означало бы платить их каждому зрителю; на обновление — раз в TTL.
      cache = { body, contentType, fetchedAt: Date.now(), gzipped: gzipSync(body) };
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

    // ⚠️ БЕЗ ЭТОГО ЗАГОЛОВКА ЭКРАН ТВ ПУСТ, И ЭТО НЕ ТЕОРИЯ — так и было.
    // Приложение живёт на sherlock-scholes.vercel.app, релей на railway.app:
    // запрос кросс-доменный, и браузер выбрасывает ответ, если сервер не
    // разрешил origin явно. Снаружи это выглядит как «Не удалось загрузить
    // список каналов» — то есть как поломка приложения, а не отсутствие
    // одной строки здесь.
    //
    // `*`, а не конкретный домен: у каждого preview-развёртывания Vercel свой
    // origin (sherlock-scholes-git-…vercel.app), и белый список пришлось бы
    // править под каждую ветку. Каталог публичен, авторизации и cookie у него
    // нет, отдавать его кому угодно ничем не грозит: ссылки внутри и так
    // ведут на чужие серверы.
    res.setHeader('access-control-allow-origin', '*');

    // Предварительный запрос. Простой GET его не вызывает, но плееры и
    // расширения умеют слать заголовки, которые вызывают, — и тогда ответ на
    // OPTIONS решает всё.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'range, accept, accept-encoding',
        'access-control-max-age': '86400',
      });
      res.end();
      return;
    }

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

        // ⚠️ РАДИ ЧЕГО ЗДЕСЬ GZIP. Каталог отдавался 824 КБ БЕЗ СЖАТИЯ, причём
        // `Accept-Encoding: gzip` игнорировался — заголовка `content-encoding`
        // в ответе не было вовсе. Это ~17 секунд молчания на медленном 3G ради
        // списка, из которого приложению нужны несколько десятков строк, и
        // снаружи это выглядит ровно как «ТВ не работает». M3U — текст с
        // огромным повтором, он жмётся вшестеро и лучше.
        //
        // Сжимаем ТОЛЬКО когда клиент попросил: в HLS-плеерах и прокси
        // встречаются клиенты, которые пришлют пустой Accept-Encoding, и
        // отдать им gzip значит отдать мусор.
        const wantsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
        const headers = {
          'content-type': playlist.contentType,
          // `stale-while-revalidate` — чтобы браузер показал прежний список
          // сразу, а обновил его в фоне. Без него каждые max-age секунд экран
          // снова ждёт полный ответ, и ожидание видно.
          'cache-control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}, stale-while-revalidate=300`,
          // ⚠️ Без `vary` общий кэш (CDN, прокси оператора) отдаст сжатый ответ
          // клиенту, который сжатие не просил, и тот получит двоичный мусор
          // вместо плейлиста.
          vary: 'accept-encoding',
        };

        if (wantsGzip && playlist.gzipped) {
          headers['content-encoding'] = 'gzip';
          headers['content-length'] = String(playlist.gzipped.length);
          res.writeHead(200, headers);
          res.end(playlist.gzipped);
          return;
        }

        headers['content-length'] = String(Buffer.byteLength(playlist.body));
        res.writeHead(200, headers);
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
