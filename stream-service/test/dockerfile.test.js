import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

/**
 * ОБРАЗ ОБЯЗАН СОДЕРЖАТЬ ВСЁ, ЧТО СЕРВЕР ИМПОРТИРУЕТ.
 *
 * ⚠️ ЭТА ПРОВЕРКА НАПИСАНА ПО СЛЕДАМ ПАДЕНИЯ ПРОДА, А НЕ НА БУДУЩЕЕ. Завели
 * livekit.js, 27 тестов прошли, main собрался — и контейнер не поднялся:
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/livekit.js'
 *   imported from /app/server.js
 *
 * Dockerfile копирует файлы ПОИМЁННО, и новый модуль в списке не оказался.
 * Ни один тест этого не видел и увидеть не мог: на диске файл есть, и `node
 * --test` берёт его с диска, а не из образа. Нашлось только в логах Railway,
 * после провалившегося healthcheck.
 *
 * Проверка читает ИМПОРТЫ server.js и требует строку COPY на каждый
 * собственный модуль. Она не знает заранее, каких именно, — то есть поймает и
 * следующий такой файл, а не только этот.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '..', name), 'utf8');

test('Dockerfile копирует всё, что импортирует server.js', () => {
  const server = read('server.js');
  const dockerfile = read('Dockerfile');

  // Только СВОИ модули: node:* и пакеты приезжают иначе.
  const own = [...server.matchAll(/from\s+'\.\/([A-Za-z0-9_.-]+)'/g)].map((m) => m[1]);
  assert.ok(own.length > 0, 'в server.js не нашлось ни одного своего импорта — проверка пуста');

  // `COPY . .` тоже годится: тогда перечислять нечего.
  const copiesEverything = /^\s*COPY\s+\.\s+\.\s*$/m.test(dockerfile);

  for (const file of own) {
    const copied = copiesEverything
      || new RegExp(`^\\s*COPY\\s+[^\\n]*\\b${file.replace('.', '\\.')}\\b`, 'm').test(dockerfile);
    assert.ok(copied, `Dockerfile не копирует ${file} — образ упадёт с ERR_MODULE_NOT_FOUND`);
  }
});

// ⚠️ ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ: та же проверка на заведомо неполном Dockerfile
// обязана упасть. Без него она зеленела бы и на регулярке, которая ничего не
// находит, — а именно такая ошибка и делает проверку пустой.
test('контроль: неполный Dockerfile проверку не проходит', () => {
  const incomplete = 'FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nCOPY server.js ./\n';
  const own = ['livekit.js'];
  const copied = own.every((file) => new RegExp(
    `^\\s*COPY\\s+[^\\n]*\\b${file.replace('.', '\\.')}\\b`, 'm').test(incomplete));
  assert.equal(copied, false, 'проверка не отличает неполный Dockerfile от полного');
});
