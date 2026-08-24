# Stream relay service

Небольшой HTTP-сервис, который отдаёт m3u/m3u8-плейлист, проксируя (без транскода) исходный плейлист из `M3U_SOURCE_URL`. Не связан с ботами из корня репозитория — отдельный процесс, отдельный деплой.

## Переменные окружения

- `M3U_SOURCE_URL` — обязательная, URL исходного m3u/m3u8-плейлиста.
- `STREAM_ACCESS_TOKEN` — опциональная, если задана, `/playlist.m3u8` требует `?token=...`.
- `PLAYLIST_CACHE_TTL_MS` — опциональная, по умолчанию `30000` (кэш плейлиста в памяти, чтобы не дёргать источник на каждый запрос).
- `PORT` — задаётся платформой автоматически (Railway).

## Эндпоинты

- `GET /playlist.m3u8` (алиас `/playlist.m3u`) — отдаёт плейлист.
- `GET /healthz` — проверка живости.

## Деплой на Railway (отдельный сервис в том же проекте/репозитории)

1. В том же Railway-проекте, где уже крутится management-бот, **New Service → Deploy from GitHub repo** → тот же репозиторий `sherlock-ai-bot`.
2. В настройках нового сервиса выставить **Root Directory** = `stream-service` (Railway найдёт здесь свой `Dockerfile`, не трогая корневой).
3. Добавить переменные: `M3U_SOURCE_URL` (обязательно), при желании `STREAM_ACCESS_TOKEN`.
4. Сгенерировать домен (**Settings → Networking → Generate Domain**).
5. Проверить: `curl https://<домен>/healthz` → `ok`, `curl https://<домен>/playlist.m3u8` → содержимое плейлиста.
6. В приложении Sherlock Scholes использовать `https://<домен>/playlist.m3u8` (+ `?token=...`, если включена авторизация) как источник потока.

## Тесты

```bash
npm test
```
