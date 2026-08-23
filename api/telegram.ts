import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf } from 'telegraf';
import Anthropic from '@anthropic-ai/sdk';

// Переменные окружения (задаются в Vercel)
const botToken = process.env.BOT_TOKEN!;
const starimgKey = process.env.STARIMG_API_KEY!;
const baseURL = process.env.STARIMG_BASE_URL || 'https://ai.starimg.ru'; // БЕЗ /v1 для Anthropic
const model = process.env.AI_MODEL || 'claude-opus-5';

if (!botToken || !starimgKey) {
  throw new Error('BOT_TOKEN and STARIMG_API_KEY are required');
}

// Инициализация Anthropic клиента
const client = new Anthropic({
  apiKey: starimgKey,
  baseURL: baseURL, // Starimg ожидает Anthropic-совместимый API
});

// Создаём экземпляр Telegraf
const bot = new Telegraf(botToken);

bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    await ctx.replyWithChatAction('typing');

    const message = await client.messages.create({
      model: model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
    });

    const reply = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    await ctx.reply(reply || 'Пустой ответ от ИИ');
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
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
}