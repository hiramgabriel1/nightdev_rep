import TelegramBot from 'node-telegram-bot-api'
import { logger } from './logger.js'

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, (msg) => {
    logger.info(`/start from ${msg.from?.username || msg.from?.id}`)
    bot.sendMessage(msg.chat.id, 'Welcome! Use /help to see available commands.')
  })

  bot.onText(/\/help/, (msg) => {
    logger.info(`/help from ${msg.from?.username || msg.from?.id}`)
    bot.sendMessage(msg.chat.id, 'Available commands:\n/start - Start the bot\n/help - Show this message')
  })
}
