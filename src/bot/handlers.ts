import TelegramBot, { Message } from 'node-telegram-bot-api'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'
import { openclaw } from '../services/openclaw.js'
import { pendingConfig } from './commands.js'
import { sanitizeOutput } from '../services/security.js'

const rateLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
})

async function checkRateLimit(telegramId: string): Promise<boolean> {
  try {
    await rateLimiter.consume(telegramId)
    return true
  } catch {
    return false
  }
}

export async function handleMessage(bot: TelegramBot, msg: Message) {
  if (msg.text?.startsWith('/')) return

  const telegramId = String(msg.from?.id)

  if (pendingConfig.has(telegramId)) return

  const text = msg.text?.trim() || ''
  const username = msg.from?.username
  const user = username ?? msg.from?.id ?? 'unknown'

  await prisma.user.upsert({
    where: { telegramId },
    update: { username },
    create: { telegramId, username },
  }).catch((err: unknown) => logger.error('Failed to upsert user', err))

  if (!(await checkRateLimit(telegramId))) {
    bot.sendMessage(msg.chat.id, '⏳ Demasiados mensajes. Espera un momento antes de enviar otro.')
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { telegramId } })

  if (!dbUser) {
    bot.sendMessage(msg.chat.id, 'Envía /start para comenzar.')
    return
  }

  if (!dbUser.useOurService && !dbUser.provider) {
    await prisma.user.update({
      where: { telegramId },
      data: { useOurService: true },
    })
    logger.info(`Auto-enabled Nightdev mode for user ${user}`)
  }

  logger.info(`Sending message to OpenClaw main agent from ${user}: ${text}`)

  try {
    const response = sanitizeOutput(await openclaw.sendMessage(text, 'main'))
    bot.sendMessage(msg.chat.id, response)
  } catch (err) {
    logger.error('OpenClaw message failed', err)
    bot.sendMessage(msg.chat.id, '❌ Error al procesar el mensaje. Intenta de nuevo.')
  }
}
