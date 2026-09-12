// Совместный просмотр: пропуск в комнату LiveKit.
//
// ЗАЧЕМ ЭТО ЗДЕСЬ, А НЕ В ПРИЛОЖЕНИИ. У MatchLive (Aloews/sherlock-tv) сервера
// нет вовсе — это статическая страница на Vercel. Подписывать пропуск можно
// только там, где лежит секрет, а единственный сервер этого продукта — вот
// этот релей. Поэтому ключ LiveKit живёт рядом с ключом плейлиста, и наружу
// уходит КОРОТКОЖИВУЩИЙ пропуск, а не ключ.
//
// ⚠️ ЧЕМ ЗАКРЫТА КОМНАТА, И ЧЕМ ОНА НЕ ЗАКРЫТА. Проверки «кто ты» здесь нет и
// взяться ей неоткуда: Telegram отдаёт подпись только приложениям, у которых
// есть сервер бота, а у этого его нет. Значит, пропуск в комнату получает
// всякий, кто знает КОД КОМНАТЫ, — код и есть ключ. Отсюда два следствия, и
// оба обязательны:
//
//   * код генерирует приложение случайным, а не человек по памяти:
//     угадываемый код — это открытая дверь;
//   * `LIVEKIT_ACCESS_TOKEN` (если задан) закрывает саму выдачу пропусков,
//     ровно как `STREAM_ACCESS_TOKEN` закрывает плейлист.
//
// ⚠️ ПРАВА В ПРОПУСКЕ УЗКИЕ, И РАСШИРИТЬ ИХ КЛИЕНТ НЕ МОЖЕТ. Войти,
// публиковать микрофон и камеру, слать сообщения комнаты — и всё. Ни
// roomAdmin, ни roomList, ни roomCreate, ни демонстрации экрана: список
// источников решает сервер, клиент может только не пользоваться разрешённым.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Сколько живёт пропуск. Матч с добавленным временем и разговором после. */
export const TOKEN_TTL_SECONDS = 4 * 60 * 60;

/**
 * Каким может быть код комнаты.
 *
 * ⚠️ ЭТО НЕ ПРИДИРКА К ВНЕШНЕМУ ВИДУ. Имя комнаты уходит в JWT и в LiveKit;
 * пускать туда что попало — значит пускать туда управляющие символы и
 * пробелы, по которым потом ничего не сходится. Нижний регистр — чтобы
 * «MATCH-1» и «match-1» были одной комнатой, а не двумя.
 */
const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{2,47}$/;

/** Приводит код к канону: обрезает пробелы и опускает регистр. */
export function normalizeRoom(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function isValidRoom(room) {
  return ROOM_PATTERN.test(room);
}

/**
 * Имя участника, как его увидят остальные.
 *
 * Режется до 32 символов и лишается управляющих символов: это чужой текст,
 * он попадёт на экран к другим людям.
 */
export function cleanDisplayName(raw) {
  if (typeof raw !== 'string') return '';
  const printable = [...raw.trim()].filter((ch) => {
    const code = ch.codePointAt(0);
    return code > 0x1f && code !== 0x7f;
  });
  return printable.slice(0, 32).join('');
}

/**
 * Кто это в комнате.
 *
 * ⚠️ СЛУЧАЙНЫЙ ХВОСТ ОБЯЗАТЕЛЕН. LiveKit считает identity уникальным и при
 * втором таком же ВЫКИДЫВАЕТ первого. Два зрителя, назвавшихся одинаково,
 * выбивали бы друг друга из комнаты по очереди, и снаружи это выглядит как
 * «связь рвётся», а не как совпадение имён.
 */
export function makeIdentity() {
  return `tv-${randomBytes(8).toString('hex')}`;
}

function b64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlJson(value) {
  return b64url(Buffer.from(JSON.stringify(value), 'utf8'));
}

/**
 * Пропуск LiveKit: JWT, подписанный HS256 секретом сервиса.
 *
 * `now` параметром, а не из часов, чтобы проверка могла посмотреть на срок
 * годности, не дожидаясь четырёх часов.
 */
export function signLivekitToken({
  apiKey, apiSecret, room, identity, name,
  ttlSeconds = TOKEN_TTL_SECONDS,
  now = Math.floor(Date.now() / 1000),
}) {
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson({
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: now + ttlSeconds,
    ...(name ? { name } : {}),
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // Сообщения комнаты нужны самому совместному просмотру: ими
      // расходится, какой канал сейчас смотрят. Без них «вместе» сводится к
      // «в одном разговоре», а канал каждый ищет руками.
      canPublishData: true,
      // Микрофон и камера — и ничего больше. Демонстрация экрана оставлена
      // снаружи намеренно: это правовая поверхность (показ чужой
      // трансляции другим), и один список на сервере надёжнее уговора на
      // клиенте.
      canPublishSources: ['microphone', 'camera'],
    },
  });
  const data = `${head}.${body}`;
  const sig = createHmac('sha256', apiSecret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

/**
 * Сверка общего секрета — постоянным временем.
 *
 * `timingSafeEqual` бросает на строках разной длины, поэтому длина
 * сравнивается отдельно; утечка длины секрета здесь ничего не стоит.
 */
export function isAuthorizedForTokens(url, accessToken) {
  if (!accessToken) return true;
  const given = url.searchParams.get('token') || '';
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(accessToken, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Обработчик `GET /livekit-token`.
 *
 * Возвращает `null`, если путь не его, — тогда вызывающий продолжает свой
 * разбор. Так релей плейлиста и выдача пропусков не знают друг о друге.
 *
 * ⚠️ CORS ОБЯЗАТЕЛЕН, И ЭТО НЕ ПЕРЕСТРАХОВКА. Приложение живёт на другом
 * домене (Vercel), браузер шлёт preflight и без `access-control-allow-origin`
 * ВЫБРАСЫВАЕТ ответ, даже успешный. На этом же релее так уже ломался
 * плейлист — см. README MatchLive.
 */
export function createLivekitTokenHandler({
  apiKey, apiSecret, serverUrl, accessToken, ttlSeconds = TOKEN_TTL_SECONDS,
}) {
  return function handle(req, res, url) {
    if (url.pathname !== '/livekit-token') return false;

    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return true;
    }

    const json = (status, payload) => {
      res.writeHead(status, { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(payload));
    };

    // Не настроено — отвечаем честно, а не подписываем пустым секретом.
    // Пустая подпись выглядит как настоящий пропуск и отвергается уже
    // LiveKit, то есть ошибка всплывает на шаг позже и не там.
    if (!apiKey || !apiSecret || !serverUrl) {
      json(503, { error: 'livekit_not_configured' });
      return true;
    }

    if (!isAuthorizedForTokens(url, accessToken)) {
      json(403, { error: 'forbidden' });
      return true;
    }

    const room = normalizeRoom(url.searchParams.get('room'));
    if (!isValidRoom(room)) {
      json(400, { error: 'bad_room' });
      return true;
    }

    const identity = makeIdentity();
    const name = cleanDisplayName(url.searchParams.get('name'));
    const token = signLivekitToken({
      apiKey, apiSecret, room, identity, name, ttlSeconds,
    });

    json(200, { url: serverUrl, token, room, identity, ttl: ttlSeconds });
    return true;
  };
}
