import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from './logger.js'
import { prisma } from './db.js'
import { requestApiKeys } from './handlers.js'

const welcomeText =
  'Bienvenido a Nightdev. Aquí podrás programar desde tu celular.\n\nOpciones:'

async function upsertUser(telegramId: string, msg: Message) {
  const from = msg.from
  await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from?.username ?? undefined,
      firstName: from?.first_name ?? undefined,
      lastName: from?.last_name ?? undefined,
      languageCode: from?.language_code ?? undefined,
    },
    create: {
      telegramId,
      username: from?.username ?? undefined,
      firstName: from?.first_name ?? undefined,
      lastName: from?.last_name ?? undefined,
      languageCode: from?.language_code ?? undefined,
    },
  })
}

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const telegramId = String(msg.from?.id ?? 'unknown')
    const username = msg.from?.username
    logger.info(`/start from ${username ?? telegramId}`)

    await upsertUser(telegramId, msg)

    bot.sendMessage(msg.chat.id, welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Conectar mi API key (bot propio)', callback_data: 'connect_api' }],
          [{ text: 'Usar Nightdev como orquestador', callback_data: 'use_orchestrator' }],
        ],
      },
    })
  })

  bot.on('callback_query', async (query) => {
    const telegramId = String(query.from?.id)
    const user = query.from?.username ?? query.from?.id
    logger.info(`Callback: ${query.data} from ${user}`)

    if (query.data === 'connect_api') {
      await prisma.user.update({
        where: { telegramId },
        data: { useOurService: false },
      })
      requestApiKeys(telegramId)
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(
        query.message?.chat.id!,
        'Envía tu API key de OpenCode',
      )
    } else if (query.data === 'use_orchestrator') {
      await prisma.user.update({
        where: { telegramId },
        data: { useOurService: true },
      })
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(
        query.message?.chat.id!,
        '🚀 ¡Listo! Ya puedes empezar a crear desde aquí.\n\n' +
        'Dime qué quieres construir y yo me encargo. Por ejemplo:\n\n' +
        '• "Crea una API REST con Express"\n' +
        '• "Hazme una landing page en React"\n' +
        '• "Crea un script en Python que scrapeé una web"\n\n' +
        'Solo escribe lo que necesitas y el agente lo construye por ti.',
      )
    }
  })

  bot.onText(/\/help/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/help from ${user}`)
    bot.sendMessage(msg.chat.id, 'Envía /start para ver las opciones disponibles.')
  })
}
