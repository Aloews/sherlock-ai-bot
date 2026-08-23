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