import TelegramBot from 'node-telegram-bot-api'
import { logger } from './logger.js'
import { prisma } from './db.js'

const welcomeText =
  'Bienvenido a Nightdev. Aquí podrás programar desde tu celular.\n\nOpciones:'

async function upsertUser(telegramId: string, username?: string) {
  await prisma.user.upsert({
    where: { telegramId },
    update: { username: username ?? undefined },
    create: { telegramId, username: username ?? undefined },
  })
}

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const telegramId = String(msg.from?.id ?? 'unknown')
    const username = msg.from?.username
    logger.info(`/start from ${username ?? telegramId}`)

    await upsertUser(telegramId, username)

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
    const user = query.from?.username ?? query.from?.id
    logger.info(`Callback: ${query.data} from ${user}`)

    if (query.data === 'connect_api') {
      await prisma.user.update({
        where: { telegramId: String(query.from?.id) },
        data: { mode: 'bot' },
      })
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(
        query.message?.chat.id!,
        'Envía tu API key de OpenCode y tu token de Telegram Bot para configurar tu bot propio.',
      )
    } else if (query.data === 'use_orchestrator') {
      await prisma.user.update({
        where: { telegramId: String(query.from?.id) },
        data: { mode: 'orchestrator' },
      })
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(
        query.message?.chat.id!,
        'Has seleccionado usar Nightdev como tu orquestador. Próximamente podrás gestionar tus proyectos desde aquí.',
      )
    }
  })

  bot.onText(/\/help/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/help from ${user}`)
    bot.sendMessage(msg.chat.id, 'Envía /start para ver las opciones disponibles.')
  })
}
