import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';

// Переменные окружения (настраиваются в Vercel)
const botToken = process.env.BOT_TOKEN!;
const starimgKey = process.env.STARIMG_API_KEY!;
const baseURL = process.env.STARIMG_BASE_URL || 'https://ai.starimg.ru/v1';
const model = process.env.AI_MODEL || 'claude-opus-5';

if (!botToken || !starimgKey) {
  throw new Error('BOT_TOKEN and STARIMG_API_KEY are required');
}

// Инициализация OpenAI клиента (используем Starimg как OpenAI-совместимый)
const client = new OpenAI({
  apiKey: starimgKey,
  baseURL: baseURL,
});

// Создаём экземпляр Telegraf
const bot = new Telegraf(botToken);

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  try {
    // Отправляем "печатает..." (опционально)
    await ctx.replyWithChatAction('typing');

    // Запрос к Starimg
    const completion = await client.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || 'Пустой ответ от ИИ';
    await ctx.reply(reply);
  } catch (error: any) {
    console.error('AI request failed:', error);
    await ctx.reply('Произошла ошибка при обращении к ИИ. Попробуйте позже.');
  }
});

// Webhook handler для Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(200).send('Bot is running');
    return;
  }

  try {
    // Передаём обновление от Telegram в Telegraf
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
}