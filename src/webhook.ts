import { Router, type Request, type Response } from 'express'
import { logger } from './core/logger.js'
import { prisma } from './core/db.js'
import { openclaw } from './services/openclaw.js'
import { sendTelegramMessage, validateBotToken, setWebhook } from './services/telegram.js'

const router = Router()

router.post('/webhook/:botToken', async (req: Request, res: Response) => {
  res.sendStatus(200)

  const botToken = req.params.botToken as string
  const update = req.body

  const message = update.message || update.edited_message
  if (!message?.text?.trim()) return

  const chatId = message.chat.id
  const text = message.text.trim()
  const telegramId = String(message.from?.id)
  const username = message.from?.username

  let user = await prisma.user.findUnique({ where: { botToken } })
  if (!user) {
    user = await prisma.user.create({
      data: { botToken, telegramId, username, useOurService: true },
    }).catch(() => null)
    if (!user) {
      logger.error(`Webhook: failed to create user for bot token ${botToken.slice(0, 8)}...`)
      return
    }
  }

  try {
    const response = await openclaw.sendMessage(text, user.telegramId || telegramId, username)
    const replyText = response.text || ''
    await sendTelegramMessage(botToken, chatId, replyText)
  } catch (err) {
    logger.error('Webhook bridge error', err)
    await sendTelegramMessage(botToken, chatId, 'Error processing your message. Please try again.')
  }
})

export async function registerBotToken(botToken: string, webhookBaseUrl: string) {
  const validation = await validateBotToken(botToken)
  if (!validation.ok) {
    return { ok: false, error: 'Invalid bot token' }
  }

  const webhookUrl = `${webhookBaseUrl.replace(/\/+$/, '')}/webhook/${botToken}`
  const webhookOk = await setWebhook(botToken, webhookUrl)
  if (!webhookOk) {
    return { ok: false, error: 'Failed to set webhook. Check that your bot token is correct.' }
  }

  await prisma.user.upsert({
    where: { botToken },
    create: { botToken, telegramId: validation.id, username: validation.username, useOurService: true },
    update: { telegramId: validation.id, username: validation.username },
  })

  return {
    ok: true,
    telegramId: validation.id,
    username: validation.username,
    webhookUrl,
  }
}

export default router
