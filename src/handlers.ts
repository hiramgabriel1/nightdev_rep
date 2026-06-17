import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from './logger.js'
import { prisma } from './db.js'

const pendingKeys = new Map<string, string>()

export function handleMessage(bot: TelegramBot, msg: Message) {
  if (msg.text?.startsWith('/')) return

  const text = msg.text?.trim() || ''
  const telegramId = String(msg.from?.id)
  const user = msg.from?.username ?? msg.from?.id ?? 'unknown'

  const pending = pendingKeys.get(telegramId)

  if (pending === 'opencode') {
    pendingKeys.set(telegramId, 'telegram')
    prisma.user.update({
      where: { telegramId },
      data: { opencodeApiKey: text },
    }).catch((err) => logger.error('Failed to save opencodeApiKey', err))
    bot.sendMessage(msg.chat.id, 'Envía tu API key de Telegram Bot para configurar tu bot propio.')
    return
  }

  if (pending === 'telegram') {
    pendingKeys.delete(telegramId)
    prisma.user.update({
      where: { telegramId },
      data: { tgApiKey: text },
    }).catch((err) => logger.error('Failed to save tgApiKey', err))
    bot.sendMessage(msg.chat.id, 'Credenciales guardadas. Tu bot propio está listo.')
    return
  }

  logger.debug(`Unhandled text from ${user}: "${text}"`)
  bot.sendMessage(msg.chat.id, 'Envía /start para ver las opciones disponibles.')
}

export function requestApiKeys(telegramId: string) {
  pendingKeys.set(telegramId, 'opencode')
}
