import TelegramBot, { Message } from 'node-telegram-bot-api'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'
import { runPipeline } from '../services/pipeline.js'
import { pendingConfig } from './commands.js'

const rateLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
})

const BUILD_KEYWORDS = [
  'crea', 'crear', 'haz', 'hacer', 'build', 'construye', 'construir',
  'genera', 'generar', 'escribe', 'escribir', 'programa', 'programar',
  'desarrolla', 'desarrollar', 'implementa', 'implementar', 'arma',
  'hazme', 'creame', 'generame', 'dame', 'quiero', 'necesito',
  'api', 'app', 'web', 'script', 'bot', 'landing', 'backend', 'frontend',
  'funcion', 'función', 'clase', 'componente', 'endpoint', 'servicio',
  'setup', 'configura', 'instala', 'deploy', 'test', 'prueba',
]

const GREETINGS = [
  'hola', 'hello', 'hi', 'hey', 'buenas', 'buenos', 'buenas tardes',
  'buenos dias', 'buenas noches', 'que tal', 'como estas', 'como va',
  'saludos', 'que onda', 'hi there', 'good morning', 'good evening',
  'gracias', 'thanks', 'thank', 'ok', 'vale', 'si', 'no', 'yes', 'no',
  'jaja', 'jeje', 'lol', 'xd', '👋', '', '❤️',
]

function isBuildRequest(text: string): boolean {
  const lower = text.toLowerCase()

  for (const greeting of GREETINGS) {
    if (lower === greeting || lower.startsWith(greeting + ' ') || lower.endsWith(' ' + greeting)) {
      return false
    }
  }

  for (const keyword of BUILD_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true
    }
  }

  return lower.length > 15
}

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

  if (!isBuildRequest(text)) {
    bot.sendMessage(
      msg.chat.id,
      ' ¡Hola! Dime qué quieres construir y me pongo a trabajar.\n\n' +
      'Por ejemplo:\n' +
      '• "Crea una API REST con Express"\n' +
      '• "Hazme una landing page en React"\n' +
      '• "Crea un script en Python"\n\n' +
      'Usa /config para cambiar tu configuración.',
    )
    return
  }

  logger.info(`Routing to pipeline for user ${user}`)
  await runPipeline(bot, msg.chat.id, telegramId, text)
}
