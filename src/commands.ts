import TelegramBot from 'node-telegram-bot-api'
import { logger } from './logger.js'

const welcomeText =
  'Bienvenido a Nightdev. Aquí podrás programar desde tu celular.\n\nOpciones:'

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/start from ${user}`)

    bot.sendMessage(msg.chat.id, welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Conectar mi API key (bot propio)', callback_data: 'connect_api' }],
          [{ text: 'Usar Nightdev como orquestador', callback_data: 'use_orchestrator' }],
        ],
      },
    })
  })

  bot.on('callback_query', (query) => {
    logger.info(`Callback: ${query.data} from ${query.from?.username ?? query.from?.id}`)

    if (query.data === 'connect_api') {
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(
        query.message?.chat.id!,
        'Envía tu API key de OpenCode y tu token de Telegram Bot para configurar tu bot propio.',
      )
    } else if (query.data === 'use_orchestrator') {
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
