import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from './logger.js'

const responses: Record<string, string> = {
  hola: '¡Hola! ¿Cómo estás?',
  'cómo estás': '¡Todo bien! ¿Y tú?',
  'qué puedes hacer': 'Por ahora respondo saludos. Pronto haré más cosas.',
  ayuda: 'Prueba con: hola, cómo estás, qué puedes hacer',
}

export function handleMessage(bot: TelegramBot, msg: Message) {
  if (msg.text?.startsWith('/')) return

  const text = msg.text?.toLowerCase().trim() || ''
  const user = msg.from?.username ?? msg.from?.id ?? 'unknown'

  for (const [key, value] of Object.entries(responses)) {
    if (text.includes(key)) {
      logger.info(`Matched "${key}" for user ${user}`)
      bot.sendMessage(msg.chat.id, value)
      return
    }
  }

  logger.debug(`No match for: "${text}" from user ${user}`)
  bot.sendMessage(msg.chat.id, 'No entendí eso. Envía "ayuda" para ver qué puedo hacer.')
}
