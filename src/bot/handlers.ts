import TelegramBot, { Message } from 'node-telegram-bot-api'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'
import { openclaw } from '../services/openclaw.js'
import { pendingConfig, PENDING_COMMIT } from './commands.js'
import { sanitizeOutput } from '../services/security.js'
import { estimateRequestTokens } from '../services/tokens.js'

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
  if (PENDING_COMMIT.has(telegramId)) return

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

  if (dbUser.useOurService && dbUser.freeTokens <= 0) {
    bot.sendMessage(
      msg.chat.id,
      '💀 Te has quedado sin tokens gratis.\n\nConfigura tu propia API key con /config o ponte en contacto para obtener más.',
    )
    return
  }

  logger.info(`Sending message to OpenClaw main agent from ${user}: ${text}`)

  const statusMsg = await bot.sendMessage(msg.chat.id, ' Analizando...')

  try {
    const response = await openclaw.sendMessage(
      text, telegramId, username,
      dbUser.provider ?? undefined,
      dbUser.providerApiKey ?? undefined,
    )
    const cleanText = sanitizeOutput(response.text || '')

    if (dbUser.useOurService && dbUser.freeTokens > 0) {
      const tokensUsed = estimateRequestTokens(text, cleanText, response.pipeline_type)
      await prisma.user.update({
        where: { telegramId },
        data: { freeTokens: { decrement: tokensUsed } },
      })
      logger.info(`Deducted ${tokensUsed} tokens from ${user}`)
    }

    if (response.pipeline_type === 'build' && dbUser.githubRepo && !dbUser.githubDeployKeyDone) {
      await bot.editMessageText(
        cleanText + '\n\n⚠️ Configura tu deploy key en GitHub para poder subir código.',
        {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Ver deploy key', callback_data: 'deploykey_show' }],
            ],
          },
        },
      )
      return
    }

    if (response.pipeline_type === 'build' && dbUser.githubRepo) {
      await bot.editMessageText(cleanText, {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: ' Subir a GitHub', callback_data: 'commit_yes' },
              { text: ' Solo ver', callback_data: 'commit_no' },
            ],
          ],
        },
      })
      return
    }

    await bot.editMessageText(cleanText, {
      chat_id: msg.chat.id,
      message_id: statusMsg.message_id,
    })
  } catch (err) {
    logger.error('OpenClaw message failed', err)
    await bot.editMessageText('❌ Error al procesar el mensaje. Intenta de nuevo.', {
      chat_id: msg.chat.id,
      message_id: statusMsg.message_id,
    })
  }
}
