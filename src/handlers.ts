import TelegramBot from 'node-telegram-bot-api'

export function handleMessage(bot: TelegramBot, msg: TelegramBot.Message) {
  if (msg.text?.startsWith('/')) return
}
