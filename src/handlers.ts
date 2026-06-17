import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from './logger.js'

export function handleMessage(bot: TelegramBot, msg: Message) {
  if (msg.text?.startsWith('/')) return

  const text = msg.text?.trim() || ''
  const user = msg.from?.username ?? msg.from?.id ?? 'unknown'

  logger.debug(`Unhandled text from ${user}: "${text}"`)
  bot.sendMessage(msg.chat.id, 'Envía /start para ver las opciones disponibles.')
}
