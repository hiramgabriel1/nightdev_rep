import { logger } from '../core/logger.js'

export async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(chatId),
          text,
          parse_mode: 'Markdown',
        }),
      },
    )
    if (!res.ok) {
      const body = await res.text()
      logger.error(`Telegram API error for bot ${botToken.slice(0, 8)}...: ${res.status} ${body}`)
      return false
    }
    return true
  } catch (err) {
    logger.error(`Telegram API request failed for bot ${botToken.slice(0, 8)}...`, err)
    return false
  }
}

export async function validateBotToken(botToken: string): Promise<{ ok: boolean; id?: string; username?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    if (!res.ok) return { ok: false }
    const data = await res.json() as { ok: boolean; result: { id: number; username?: string } }
    if (!data.ok) return { ok: false }
    return { ok: true, id: String(data.result.id), username: data.result.username }
  } catch {
    return { ok: false }
  }
}

export async function setWebhook(botToken: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, drop_pending_updates: true }),
      },
    )
    if (!res.ok) {
      const body = await res.text()
      logger.error(`setWebhook failed for bot ${botToken.slice(0, 8)}...: ${body}`)
    }
    return res.ok
  } catch (err) {
    logger.error(`setWebhook request failed for bot ${botToken.slice(0, 8)}...`, err)
    return false
  }
}
