import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from './logger.js'
import { prisma } from './db.js'

const pendingKeys = new Map<string, string>()

const OPENCODE_API_KEY_REGEX = /^[a-zA-Z0-9_-]{10,}$/
const TELEGRAM_BOT_TOKEN_REGEX = /^\d{5,16}:[a-zA-Z0-9_-]{34}$/

export function handleMessage(bot: TelegramBot, msg: Message) {
  if (msg.text?.startsWith('/')) return

  const text = msg.text?.trim() || ''
  const telegramId = String(msg.from?.id)
  const user = msg.from?.username ?? msg.from?.id ?? 'unknown'

  const pending = pendingKeys.get(telegramId)

  if (pending === 'opencode') {
    if (!OPENCODE_API_KEY_REGEX.test(text)) {
      bot.sendMessage(msg.chat.id, 'Esa API key no parece válida. Debe tener al menos 10 caracteres alfanuméricos.')
      return
    }

    pendingKeys.set(telegramId, 'telegram')
    prisma.user.update({
      where: { telegramId },
      data: { opencodeApiKey: text },
    }).catch((err) => logger.error('Failed to save opencodeApiKey', err))
    bot.sendMessage(msg.chat.id, 'Envía tu API key de Telegram Bot para configurar tu bot propio.')
    return
  }

  if (pending === 'telegram') {
    if (!TELEGRAM_BOT_TOKEN_REGEX.test(text)) {
      bot.sendMessage(msg.chat.id, 'Ese token no parece válido. Formato esperado: 123456:ABC-DEF...')
      return
    }

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
