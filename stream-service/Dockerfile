FROM node:20-slim

WORKDIR /app

COPY package*.json ./

# ⚠️ КАЖДЫЙ СОБСТВЕННЫЙ МОДУЛЬ ПЕРЕЧИСЛЯЕТСЯ ЗДЕСЬ ПОИМЁННО, И ЭТО УЖЕ РАЗ
# СТОИЛО ПАДЕНИЯ ПРОДА. Файл livekit.js завели, тесты прошли, main собрался —
# а контейнер не поднялся вовсе:
#
#   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/livekit.js'
#   imported from /app/server.js
#
# Локально всё работает: файл на диске есть. Не видит его только образ, и
# узнать об этом можно было лишь из логов Railway, уже после healthcheck.
#
# Список остаётся поимённым (а не `COPY . .`) намеренно: в папке лежат тесты и
# README, и тащить их в боевой образ незачем. Цена такого выбора — обязанность
# дописывать строку; за этим следит тест «Dockerfile копирует всё, что
# импортирует server.js».
COPY server.js ./
COPY livekit.js ./

EXPOSE 8080

CMD ["node", "server.js"]
