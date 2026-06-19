import TelegramBot, { Message } from 'node-telegram-bot-api'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'
import { openclaw } from '../services/openclaw.js'
import { pendingConfig, PENDING_COMMIT } from './commands.js'
import { sanitizeOutput } from '../services/security.js'
import { estimateRequestTokens } from '../services/tokens.js'
import { checkAbusiveTokenUsage } from '../services/anti-abuse.js'
import { t, getLangFromDb } from '../core/i18n.js'

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
    bot.sendMessage(msg.chat.id, t('en', 'rateLimited'))
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { telegramId } })

  if (!dbUser) {
    bot.sendMessage(msg.chat.id, t('en', 'sendStart'))
    return
  }

  const lang = getLangFromDb(dbUser)

  if (dbUser.blocked) {
    bot.sendMessage(msg.chat.id, t(lang, 'accountSuspended'))
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
      t(lang, 'noTokensLeft'),
    )
    return
  }

  logger.info(`Sending message to OpenClaw main agent from ${user}: ${text}`)

  const statusMsg = await bot.sendMessage(msg.chat.id, t(lang, 'analyzing'))

  try {
    const response = await openclaw.sendMessage(
      text, telegramId, username,
      dbUser.provider ?? undefined,
      dbUser.providerApiKey ?? undefined,
    )
    const cleanText = sanitizeOutput(response.text || '')

    if (dbUser.useOurService && dbUser.freeTokens > 0) {
      const tokensUsed = estimateRequestTokens(text, cleanText, response.pipeline_type)
      const updated = await prisma.user.update({
        where: { telegramId },
        data: { freeTokens: { decrement: tokensUsed }, lastRequestAt: new Date() },
      })
      logger.info(`Deducted ${tokensUsed} tokens from ${user} (${updated.freeTokens} remaining)`)

      const abusive = await checkAbusiveTokenUsage(telegramId, updated.freeTokens, tokensUsed)
      if (abusive) {
        await bot.editMessageText(
          t(lang, 'autoBlocked'),
          { chat_id: msg.chat.id, message_id: statusMsg.message_id },
        )
        return
      }
    }

    if (response.pipeline_type === 'build' && dbUser.githubRepo && !dbUser.githubDeployKeyDone) {
      await bot.editMessageText(
        cleanText + t(lang, 'setupDeployKeyWarning'),
        {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btnDeployKey'), callback_data: 'deploykey_show' }],
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
              { text: t(lang, 'btnPushToGithub'), callback_data: 'commit_yes' },
              { text: t(lang, 'btnViewOnly'), callback_data: 'commit_no' },
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
    await bot.editMessageText(t(lang, 'msgError'), {
      chat_id: msg.chat.id,
      message_id: statusMsg.message_id,
    })
  }
}
