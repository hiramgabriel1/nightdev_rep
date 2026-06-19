import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'
import { openclaw } from '../services/openclaw.js'

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

export const pendingConfig = new Map<string, { step: 'provider' | 'apikey' | 'repo' | 'repourl'; provider?: string }>()
export const PENDING_COMMIT = new Map<string, { message: string }>()

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
      'Tienes 100,000 tokens gratis para empezar. 🎁\n\n' +
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
      status += `💰 Tokens gratis restantes: ${user.freeTokens.toLocaleString()}\n`
    } else if (user.provider) {
      status += `🔑 Modo: API key propia (${user.provider})\n`
    } else {
      status += '⚠️ Modo: No configurado\n'
    }

    if (user.tgApiKey) {
      const masked = user.tgApiKey.slice(0, 6) + '••••' + user.tgApiKey.slice(-4)
      status += `🤖 Bot Token: ${masked}\n`
    }

    if (user.githubRepo) {
      status += `📦 Repo: ${user.githubRepo}\n`
      status += `🌿 Rama: ${user.githubBranch}\n`
      status += user.githubDeployKeyDone ? '🔑 Deploy key: ✅ configurada\n' : '🔑 Deploy key: ❌ pendiente\n'
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

    let configDetail = `⚙️ **Configuración actual:** ${currentMode}\n`
    if (user.githubRepo) {
      configDetail += `\n📦 **Repos:** \`${user.githubRepo}\``
      configDetail += `\n🌿 **Rama:** \`${user.githubBranch ?? 'main'}\``
      configDetail += `\n🔑 **Deploy key:** ${user.githubDeployKeyDone ? '✅ configurada' : '❌ pendiente'}`
    }

    bot.sendMessage(
      msg.chat.id,
      configDetail + '\n\nSelecciona una opción:',
      {
        parse_mode: 'Markdown',
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

  bot.onText(/\/repo(?: (.+))?/, async (msg, match) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, 'Envía /start primero.')
      return
    }

    const url = match?.[1]?.trim()
    if (!url) {
      bot.sendMessage(msg.chat.id, 'Usa: /repo https://github.com/usuario/repo')
      return
    }

    if (!url.includes('github.com')) {
      bot.sendMessage(msg.chat.id, '❌ Solo repositorios de GitHub son soportados.')
      return
    }

    const statusMsg = await bot.sendMessage(msg.chat.id, ' Configurando repositorio...')

    try {
      const result = await openclaw.setRepo(telegramId, url, 'main')
      if (!result.ok) {
        await bot.editMessageText('❌ Error al configurar repo: ' + (result.error || 'desconocido'), {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
        })
        return
      }

      await prisma.user.update({
        where: { telegramId },
        data: { githubRepo: result.repo || url, githubBranch: result.branch || 'main' },
      })

      const keyText = result.public_key
        ? `\n\n🔑 Agrega esta clave SSH como deploy key en GitHub:\n\n\`${result.public_key}\`\n\nSettings → Deploy keys → Add deploy key\nTitle: nightdev-robot`
        : ''

      await bot.editMessageText(
        `✅ Repositorio configurado: ${url}${keyText}`,
        {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
        },
      )
    } catch (err) {
      logger.error('setRepo failed', err)
      await bot.editMessageText('❌ Error al conectar con el bridge.', {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      })
    }
  })

  bot.onText(/\/deploykey/, async (msg) => {
    const statusMsg = await bot.sendMessage(msg.chat.id, ' Obteniendo clave...')

    try {
      const result = await openclaw.getDeployKey()
      if (!result.ok || !result.public_key) {
        await bot.editMessageText('❌ No se pudo obtener la deploy key.', {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
        })
        return
      }

      await bot.editMessageText(
        '🔑 **Deploy key de Nightdev Robot:**\n\n' +
        '```\n' + result.public_key + '\n```\n\n' +
        'Agrégala en: GitHub → Settings → Deploy keys → Add deploy key\n' +
        'Title: nightdev-robot\n' +
        '✅ Allow write access',
        {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
        },
      )
    } catch {
      await bot.editMessageText('❌ Error al conectar con el bridge.', {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      })
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
      '/repo <url> — Configurar repositorio GitHub\n' +
      '/deploykey — Ver clave SSH para GitHub\n' +
      '/help — Mostrar esta ayuda',
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

        bot.sendMessage(
          query.message?.chat.id!,
          '✅ Ahora usarás los recursos y modelos de Nightdev.',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: ' Configurar GitHub', callback_data: 'repo_ask' },
                  { text: ' No por ahora', callback_data: 'repo_skip' },
                ],
              ],
            },
          },
        )
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

    if (query.data === 'repo_ask') {
      bot.answerCallbackQuery(query.id)
      pendingConfig.set(telegramId, { step: 'repo' })
      bot.sendMessage(
        query.message?.chat.id!,
        '¿Cuál es la URL de tu repositorio de GitHub?\n\nEj: https://github.com/usuario/mi-proyecto',
      )
    }

    if (query.data === 'repo_skip') {
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(query.message?.chat.id!, 'OK, puedes configurarlo después con /repo.')
    }

    if (query.data === 'commit_yes') {
      bot.answerCallbackQuery(query.id)
      const dbUser = await prisma.user.findUnique({ where: { telegramId } })
      if (!dbUser?.githubRepo) {
        bot.sendMessage(query.message?.chat.id!, '❌ No tienes un repo configurado. Usa /repo o /config.')
        return
      }
      if (!dbUser.githubDeployKeyDone) {
        bot.sendMessage(query.message?.chat.id!, '⚠️ Primero configura la deploy key. Usa /deploykey')
        return
      }

      const msg = await bot.sendMessage(
        query.message?.chat.id!,
        ' Subiendo código a GitHub...',
      )

      try {
        const result = await openclaw.sendMessage(
          `commit the code in the workspace to the repository ${dbUser.githubRepo} on branch ${dbUser.githubBranch}. use git add -A, commit with a descriptive message, and push.`,
          telegramId,
        )
        await bot.editMessageText(result.text || '✅ Código subido a GitHub.', {
          chat_id: query.message?.chat.id!,
          message_id: msg.message_id,
        })
      } catch (err) {
        logger.error('Commit failed', err)
        await bot.editMessageText('❌ Error al subir el código.', {
          chat_id: query.message?.chat.id!,
          message_id: msg.message_id,
        })
      }
    }

    if (query.data === 'commit_no') {
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(query.message?.chat.id!, 'OK, el código no se subió.')
    }

    if (query.data === 'deploykey_show') {
      bot.answerCallbackQuery(query.id)
      try {
        const result = await openclaw.getDeployKey()
        if (result.ok && result.public_key) {
          bot.sendMessage(
            query.message?.chat.id!,
            '🔑 **Deploy key de Nightdev Robot:**\n\n' +
            '```\n' + result.public_key + '\n```\n\n' +
            'Agrégala en: GitHub → Settings → Deploy keys → Add deploy key\n' +
            'Title: nightdev-robot\n' +
            '✅ Allow write access\n\n' +
            'Cuando la hayas agregado, escribe "listo" para confirmar.',
            { parse_mode: 'Markdown' },
          )
          pendingConfig.set(telegramId, { step: 'repourl' })
        }
      } catch {
        bot.sendMessage(query.message?.chat.id!, '❌ Error al obtener la deploy key.')
      }
    }
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return

    const telegramId = String(msg.from?.id)
    const config = pendingConfig.get(telegramId)

    if (!config) return

    // Handle deploy key confirmation
    if (config.step === 'repourl') {
      if (msg.text.toLowerCase().includes('listo')) {
        await prisma.user.update({
          where: { telegramId },
          data: { githubDeployKeyDone: true },
        })
        pendingConfig.delete(telegramId)
        bot.sendMessage(msg.chat.id, '✅ Deploy key configurada. Ahora puedo subir código a tu repo.')
      } else {
        bot.sendMessage(msg.chat.id, 'Escribe "listo" cuando hayas agregado la deploy key.')
      }
      return
    }

    if (config.step === 'provider' || config.step === 'apikey') {
      return // Handled by existing logic below
    }

    // Handle repo URL input
    if (config.step === 'repo') {
      const url = msg.text.trim()
      if (!url.includes('github.com')) {
        bot.sendMessage(msg.chat.id, '❌ Solo repositorios de GitHub son soportados. Intenta de nuevo:')
        return
      }

      pendingConfig.delete(telegramId)
      const statusMsg = await bot.sendMessage(msg.chat.id, ' Configurando repositorio...')

      try {
        const result = await openclaw.setRepo(telegramId, url, 'main')
        if (!result.ok) {
          await bot.editMessageText('❌ Error al configurar repo: ' + (result.error || 'desconocido'), {
            chat_id: msg.chat.id,
            message_id: statusMsg.message_id,
          })
          return
        }

        await prisma.user.update({
          where: { telegramId },
          data: { githubRepo: result.repo || url, githubBranch: result.branch || 'main' },
        })

        const text = result.public_key
          ? `✅ Repositorio configurado.\n\n🔑 Agrega esta SSH key como deploy key en GitHub:\n\n\`${result.public_key}\`\n\nTitle: nightdev-robot\n✅ Allow write access\n\nCuando la agregues, escribe "listo".`
          : `✅ Repositorio configurado: ${url}`

        await bot.editMessageText(text, {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
        })

        if (result.public_key) {
          pendingConfig.set(telegramId, { step: 'repourl' })
        }
      } catch (err) {
        logger.error('setRepo failed', err)
        await bot.editMessageText('❌ Error al conectar con el bridge.', {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
        })
      }
      return
    }

    // Handle API key input
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

      const statusMsg = await bot.sendMessage(msg.chat.id, '🔄 Actualizando tu contenedor...')

      try {
        const result = await openclaw.updateUserConfig(telegramId, config.provider, apiKey)
        await bot.editMessageText(
          `✅ ${provider.emoji} ${provider.name} configurado correctamente.\n🟢 Contenedor actualizado y reiniciado.`,
          { chat_id: msg.chat.id, message_id: statusMsg.message_id },
        )
      } catch {
        await bot.editMessageText(
          `✅ ${provider.emoji} ${provider.name} configurado.\n⚠️ No se pudo actualizar el contenedor. Envía un mensaje para que se configure automáticamente.`,
          { chat_id: msg.chat.id, message_id: statusMsg.message_id },
        )
      }
    }
  })
}
