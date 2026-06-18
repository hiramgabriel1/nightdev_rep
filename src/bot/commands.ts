import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'

const PROVIDERS = [
  { id: 'openclaw', name: 'OpenClaw', emoji: '🦞', prefix: 'sk-' },
  { id: 'anthropic', name: 'Claude Code', emoji: '🧠', prefix: 'sk-ant-' },
  { id: 'openai', name: 'OpenAI (GPT)', emoji: '🤖', prefix: 'sk-' },
  { id: 'google', name: 'Google Gemini', emoji: '💎', prefix: 'AIza' },
  { id: 'deepseek', name: 'DeepSeek', emoji: '🐋', prefix: 'sk-' },
  { id: 'mistral', name: 'Mistral', emoji: '🌬️', prefix: '' },
  { id: 'groq', name: 'Groq', emoji: '⚡', prefix: 'gsk_' },
  { id: 'together', name: 'Together AI', emoji: '', prefix: '' },
  { id: 'perplexity', name: 'Perplexity', emoji: '🔍', prefix: 'pplx-' },
  { id: 'xai', name: 'xAI (Grok)', emoji: '', prefix: 'xai-' },
]

export const pendingConfig = new Map<string, { step: 'provider' | 'apikey'; provider?: string }>()

async function upsertUser(telegramId: string, msg: Message) {
  const from = msg.from
  await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from?.username ?? undefined,
      firstName: from?.first_name ?? undefined,
      lastName: from?.last_name ?? undefined,
      languageCode: from?.language_code ?? undefined,
    },
    create: {
      telegramId,
      username: from?.username ?? undefined,
      firstName: from?.first_name ?? undefined,
      lastName: from?.last_name ?? undefined,
      languageCode: from?.language_code ?? undefined,
    },
  })
}

function buildProviderKeyboard() {
  const buttons = PROVIDERS.map((p) => ({
    text: `${p.emoji} ${p.name}`,
    callback_data: `config_provider:${p.id}`,
  }))

  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2))
  }
  rows.push([{ text: ' Cancelar', callback_data: 'config_cancel' }])

  return { inline_keyboard: rows }
}

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const telegramId = String(msg.from?.id ?? 'unknown')
    const username = msg.from?.username
    logger.info(`/start from ${username ?? telegramId}`)

    await upsertUser(telegramId, msg)

    bot.sendMessage(
      msg.chat.id,
      'Bienvenido a Nightdev.\n\n' +
      'Dime qué quieres construir y yo me encargo. Por ejemplo:\n\n' +
      '• "Crea una API REST con Express"\n' +
      '• "Hazme una landing page en React"\n' +
      '• "Crea un script en Python que scrapeé una web"\n\n' +
      'Usa /config para cambiar tu configuración.',
    )
  })

  bot.onText(/\/status/, async (msg) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, 'No tienes configuración. Envía /start para comenzar.')
      return
    }

    let status = '📋 Tu configuración actual:\n\n'

    if (user.useOurService) {
      status += '🟢 Modo: Nightdev (orquestador)\n'
    } else if (user.provider) {
      status += `🔑 Modo: API key propia (${user.provider})\n`
    } else {
      status += '⚠️ Modo: No configurado\n'
    }

    if (user.tgApiKey) {
      const masked = user.tgApiKey.slice(0, 6) + '••••' + user.tgApiKey.slice(-4)
      status += `🤖 Bot Token: ${masked}\n`
    }

    status += '\nUsa /config para cambiar tu configuración.'

    bot.sendMessage(msg.chat.id, status)
  })

  bot.onText(/\/config/, async (msg) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, 'Envía /start primero.')
      return
    }

    let currentMode = '️ No configurado'
    if (user.useOurService) currentMode = '🟢 Nightdev (orquestador)'
    else if (user.provider) currentMode = `🔑 API key propia (${user.provider})`

    bot.sendMessage(
      msg.chat.id,
      `⚙️ Configuración actual: ${currentMode}\n\nSelecciona una opción:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: ' Usar Nightdev', callback_data: 'config_nightdev' },
              { text: '🔑 Usar API key propia', callback_data: 'config_ownkey' },
            ],
            [{ text: '❌ Cancelar', callback_data: 'config_cancel' }],
          ],
        },
      },
    )
  })

  bot.on('callback_query', async (query) => {
    const telegramId = String(query.from?.id)
    const user = query.from?.username ?? query.from?.id
    logger.info(`Callback: ${query.data} from ${user}`)

    if (!query.data) return

    if (query.data.startsWith('config_')) {
      bot.answerCallbackQuery(query.id)

      if (query.data === 'config_nightdev') {
        await prisma.user.update({
          where: { telegramId },
          data: { useOurService: true, provider: null, providerApiKey: null },
        })
        pendingConfig.delete(telegramId)
        bot.sendMessage(query.message?.chat.id!, '✅ Ahora usarás los recursos y modelos de Nightdev.')
      } else if (query.data === 'config_ownkey') {
        pendingConfig.set(telegramId, { step: 'provider' })
        bot.sendMessage(
          query.message?.chat.id!,
          'Selecciona tu proveedor de modelos:',
          { reply_markup: buildProviderKeyboard() },
        )
      } else if (query.data.startsWith('config_provider:')) {
        const providerId = query.data.split(':')[1]
        const provider = PROVIDERS.find((p) => p.id === providerId)

        if (!provider) {
          bot.sendMessage(query.message?.chat.id!, '❌ Proveedor no válido.')
          return
        }

        pendingConfig.set(telegramId, { step: 'apikey', provider: providerId })

        const hint = provider.prefix ? ` (comienza con "${provider.prefix}")` : ''
        bot.sendMessage(
          query.message?.chat.id!,
          `Envía tu API key de ${provider.emoji} ${provider.name}${hint}:`,
        )
      } else if (query.data === 'config_cancel') {
        pendingConfig.delete(telegramId)
        bot.sendMessage(query.message?.chat.id!, '❌ Configuración cancelada.')
      }
    }
  })

  bot.onText(/\/help/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/help from ${user}`)
    bot.sendMessage(
      msg.chat.id,
      'Comandos disponibles:\n\n' +
      '/start — Iniciar y ver bienvenida\n' +
      '/config — Cambiar tu configuración\n' +
      '/status — Ver tu configuración actual\n' +
      '/help — Mostrar esta ayuda',
    )
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return

    const telegramId = String(msg.from?.id)
    const config = pendingConfig.get(telegramId)

    if (!config) return

    if (config.step === 'apikey' && config.provider) {
      const apiKey = msg.text.trim()
      const provider = PROVIDERS.find((p) => p.id === config.provider)

      if (!provider) {
        bot.sendMessage(msg.chat.id, '❌ Error interno. Intenta de nuevo con /config.')
        pendingConfig.delete(telegramId)
        return
      }

      if (apiKey.length < 10) {
        bot.sendMessage(msg.chat.id, '❌ La API key debe tener al menos 10 caracteres. Intenta de nuevo:')
        return
      }

      if (provider.prefix && !apiKey.startsWith(provider.prefix)) {
        bot.sendMessage(msg.chat.id, `❌ La API key debe comenzar con "${provider.prefix}". Intenta de nuevo:`)
        return
      }

      await prisma.user.update({
        where: { telegramId },
        data: {
          provider: config.provider,
          providerApiKey: apiKey,
          useOurService: false,
        },
      })

      pendingConfig.delete(telegramId)
      bot.sendMessage(msg.chat.id, `✅ ${provider.emoji} ${provider.name} configurado correctamente.`)
    }
  })
}
