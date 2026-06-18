import TelegramBot, { Message } from 'node-telegram-bot-api'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logger } from './logger.js'
import { prisma } from './db.js'
import { runPipeline } from './pipeline.js'

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

  const text = msg.text?.trim() || ''
  const telegramId = String(msg.from?.id)
  const username = msg.from?.username
  const user = username ?? msg.from?.id ?? 'unknown'

  await prisma.user.upsert({
    where: { telegramId },
    update: { username },
    create: { telegramId, username },
  }).catch((err) => logger.error('Failed to upsert user', err))

  if (!(await checkRateLimit(telegramId))) {
    bot.sendMessage(msg.chat.id, '⏳ Demasiados mensajes. Espera un momento antes de enviar otro.')
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { telegramId } })

  if (!dbUser?.useOurService && !dbUser?.provider) {
    bot.sendMessage(msg.chat.id, 'No tienes configuración. Usa el CLI para configurar tu cuenta o envía /start.')
    return
  }

  logger.info(`Routing to pipeline for user ${user}`)
  await runPipeline(bot, msg.chat.id, telegramId, text)
}
