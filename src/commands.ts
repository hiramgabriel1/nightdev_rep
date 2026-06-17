import TelegramBot from 'node-telegram-bot-api'
import { logger } from './logger.js'

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/start from ${user}`)
    bot.sendMessage(msg.chat.id, 'Welcome! Use /help to see available commands.')
  })

  bot.onText(/\/help/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/help from ${user}`)
    bot.sendMessage(msg.chat.id, 'Available commands:\n/start - Start the bot\n/help - Show this message')
  })
}
