# Sherlock AI Bot

Telegram-бот на TypeScript, использующий Starimg AI (OpenAI-совместимый API) для ответов на сообщения пользователей.

## Возможности

- Принимает текстовые сообщения в Telegram.
- Отправляет их в Starimg AI (модель по умолчанию `claude-opus-5`).
- Отвечает пользователю сгенерированным текстом.
- Работает как serverless-функция на Vercel (webhook).

## Технологии

- [Node.js](https://nodejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Telegraf](https://telegraf.js.org/) — фреймворк для Telegram Bot API.
- [OpenAI SDK](https://github.com/openai/openai-node) — для взаимодействия с API (совместим с Starimg).
- [Vercel](https://vercel.com) — хостинг serverless-функций.

## Установка и запуск

### 1. Клонируйте репозиторий

```bash
git clone https://github.com/ваш-username/sherlock-ai-bot.git
cd sherlock-ai-bot
```

---

# Управляющий бот (отдельный бот, отдельный токен)

Второй, независимый Telegram-бот для управления проектом `sherlock-scholes-`.
С AI-ботом выше не пересекается: свой токен (`MANAGEMENT_BOT_TOKEN`), свой
роут, свои переменные. AI-бот при этом продолжает работать как есть.

## Какая реализация живая

В репозитории лежат **две** реализации управляющего бота. Живая — только первая:

| | Файл | Режим | Статус |
|---|---|---|---|
| ✅ **Живая** | `api/management-webhook.ts` | webhook на Vercel | работает |
| ❌ Нерабочая | `bot.js` + `Dockerfile` + `entrypoint.sh` | long polling на Railway | не подключается |

**Почему long polling не взлетел.** На Railway контейнер собирается и стартует
нормально, репозиторий клонируется, но `bot.launch()` навсегда зависает на
обращении к `api.telegram.org`: ни ответа, ни ошибки, при 0% CPU и нулевом
сетевом трафике. Похоже на блокировку исходящего пути до Telegram из того
региона. В `bot.js` добавлен 30-секундный таймаут, чтобы зависание превращалось
в явный краш вместо немой тишины, — после него сервис просто перезапускается по
кругу. Код Railway-версии оставлен как есть: он рабочий и пригодится, если
сеть/регион когда-нибудь поменяются.

## Команды

Только для админов — список Telegram user ID в `ADMIN_USER_IDS` через запятую.
Остальным бот отвечает «Недостаточно прав».

| Команда | Что делает |
|---|---|
| `/status` | последний коммит целевого репозитория (GitHub API) |
| `/deploy` | запускает деплой через Vercel Deploy Hook |
| `/logs` | свежие логи Vercel (живой tail несколько секунд, не история) |
| `/pull` | подсказка: локального чекаута нет, `/deploy` и так берёт свежий коммит |
| `/db_push` | подсказка выполнить `supabase db push` вручную (см. ниже) |

Произвольные shell-команды бот не выполняет — только этот фиксированный набор.

**Почему `/db_push` не применяет миграции.** В serverless-рантайме нет ни
`supabase`, ни `git`. Сопоставить файлы `supabase/migrations/*.sql` с уже
применёнными версиями в БД без родной логики CLI надёжно нельзя, а база
боевая. Команда только напоминает выполнить `supabase db push` руками.

## Переменные окружения (проект `sherlock-ai-bot` на Vercel)

| Переменная | Обязательна | Зачем |
|---|---|---|
| `MANAGEMENT_BOT_TOKEN` | да | токен управляющего бота от BotFather |
| `ADMIN_USER_IDS` | да | ID админов через запятую |
| `VERCEL_DEPLOY_HOOK_URL` | для `/deploy` | Deploy Hook целевого проекта |
| `VERCEL_TOKEN` | для `/logs` | доступ к Vercel API |
| `GITHUB_REPO_URL` | нет | по умолчанию `sherlock-scholes-` |
| `GITHUB_TOKEN` | если репо приватный | для GitHub API |
| `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | нет | по умолчанию — целевой проект |

⚠️ Переменные на Vercel подхватываются **только после нового деплоя**.
Добавили — нажмите Redeploy, иначе функция их не увидит.

## Регистрация вебхука

Один раз после деплоя:

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://<домен>/api/management-webhook"
```

Проверка: `GET https://<домен>/api/management-webhook` должен отдать
`Management bot webhook is running`. Если вместо этого пришло сообщение о
недостающей переменной — добавьте её и сделайте Redeploy.

---

# Сервис трансляции плейлиста

`stream-service/` — отдельный маленький HTTP-сервис: отдаёт m3u/m3u8-плейлист,
проксируя источник из `M3U_SOURCE_URL` (без транскодирования, с кэшем в памяти
и опциональным токеном доступа). Деплоится отдельным сервисом на Railway с
Root Directory `stream-service`. Подробности — в `stream-service/README.md`.

Экран плеера в самой игре живёт в репозитории `sherlock-scholes-`
(`/stream`), а не здесь.