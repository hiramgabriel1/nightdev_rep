import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'
import { openclaw } from '../services/openclaw.js'
import { checkRepoAbuse } from '../services/anti-abuse.js'
import { t, getLangFromDb } from '../core/i18n.js'

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

async function getUserLang(telegramId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { language: true },
  })
  return user?.language || 'en'
}

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

function buildProviderKeyboard(lang: string) {
  const buttons = PROVIDERS.map((p) => ({
    text: `${p.emoji} ${p.name}`,
    callback_data: `config_provider:${p.id}`,
  }))

  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2))
  }
  rows.push([{ text: t(lang, 'btnCancel'), callback_data: 'config_cancel' }])

  return { inline_keyboard: rows }
}

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const telegramId = String(msg.from?.id ?? 'unknown')
    const username = msg.from?.username
    logger.info(`/start from ${username ?? telegramId}`)

    await upsertUser(telegramId, msg)
    const lang = await getUserLang(telegramId)

    bot.sendMessage(msg.chat.id, t(lang, 'start'))
  })

  bot.onText(/\/status/, async (msg) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, t('en', 'noConfigSendStart'))
      return
    }

    const lang = getLangFromDb(user)
    let status = t(lang, 'statusTitle')

    if (user.useOurService) {
      status += t(lang, 'nightdevMode')
      status += t(lang, 'freeTokens', user.freeTokens.toLocaleString())
    } else if (user.provider) {
      status += t(lang, 'ownKeyMode', user.provider)
    } else {
      status += t(lang, 'notConfigured')
    }

    if (user.tgApiKey) {
      const masked = user.tgApiKey.slice(0, 6) + '••••' + user.tgApiKey.slice(-4)
      status += t(lang, 'botToken', masked)
    }

    if (user.githubToken) {
      const masked = user.githubToken.slice(0, 4) + '••••' + user.githubToken.slice(-4)
      status += t(lang, 'githubToken', masked)
    }

    if (user.githubRepo) {
      status += t(lang, 'githubRepo', user.githubRepo)
      status += t(lang, 'githubBranch', user.githubBranch ?? 'main')
      status += user.githubDeployKeyDone ? t(lang, 'deployKeyStatusDone') : t(lang, 'deployKeyStatusPending')
    }

    status += t(lang, 'statusFooter')

    bot.sendMessage(msg.chat.id, status)
  })

  bot.onText(/\/config/, async (msg) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, t('en', 'sendStartFirst'))
      return
    }

    const lang = getLangFromDb(user)

    let currentMode = ' ' + t(lang, 'notConfigured').trim()
    if (user.useOurService) currentMode = '🟢 Nightdev (orchestrator)'
    else if (user.provider) currentMode = `🔑 API key propia (${user.provider})`

    let configDetail = t(lang, 'configTitle', currentMode)
    if (user.githubRepo) {
      configDetail += t(lang, 'configRepo', user.githubRepo)
      configDetail += t(lang, 'configBranch', user.githubBranch ?? 'main')
      configDetail += user.githubDeployKeyDone ? t(lang, 'configDeployKeyDone') : t(lang, 'configDeployKeyPending')
    }

    bot.sendMessage(
      msg.chat.id,
      configDetail + t(lang, 'configSelect'),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: t(lang, 'btnUseNightdev'), callback_data: 'config_nightdev' },
              { text: t(lang, 'btnUseOwnKey'), callback_data: 'config_ownkey' },
            ],
            [{ text: t(lang, 'btnCancel'), callback_data: 'config_cancel' }],
          ],
        },
      },
    )
  })

  bot.onText(/\/repo(?: (.+))?/, async (msg, match) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, t('en', 'sendStartFirst'))
      return
    }

    const lang = getLangFromDb(user)
    const url = match?.[1]?.trim()

    if (!url) {
      bot.sendMessage(msg.chat.id, t(lang, 'repoUsage'))
      return
    }

    if (!url.includes('github.com')) {
      bot.sendMessage(msg.chat.id, t(lang, 'repoGithubOnly'))
      return
    }

    const repoBlocked = await checkRepoAbuse(url, telegramId)
    if (repoBlocked) {
      bot.sendMessage(msg.chat.id, t(lang, 'repoBlocked'))
      return
    }

    const statusMsg = await bot.sendMessage(msg.chat.id, t(lang, 'configuringRepo'))

    try {
      const result = await openclaw.setRepo(telegramId, url, 'main')
      if (!result.ok) {
        await bot.editMessageText(t(lang, 'repoConfigError', result.error || 'desconocido'), {
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
        ? t(lang, 'addDeployKey', result.public_key)
        : ''

      await bot.editMessageText(
        t(lang, 'repoConfigured', url) + keyText,
        {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
        },
      )
    } catch (err) {
      logger.error('setRepo failed', err)
      await bot.editMessageText(t(lang, 'bridgeError'), {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      })
    }
  })

  bot.onText(/\/deploykey/, async (msg) => {
    const telegramId = String(msg.from?.id)
    const lang = await getUserLang(telegramId)

    const statusMsg = await bot.sendMessage(msg.chat.id, t(lang, 'fetchingKey'))

    try {
      const result = await openclaw.getDeployKey()
      if (!result.ok || !result.public_key) {
        await bot.editMessageText(t(lang, 'deployKeyError'), {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
        })
        return
      }

      await bot.editMessageText(
        t(lang, 'deployKeyTitle', result.public_key),
        {
          chat_id: msg.chat.id,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
        },
      )
    } catch {
      await bot.editMessageText(t(lang, 'bridgeError'), {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      })
    }
  })

  bot.onText(/\/githubtoken(?: (.+))?/, async (msg, match) => {
    const telegramId = String(msg.from?.id)
    const token = match?.[1]?.trim()

    if (!token) {
      const user = await prisma.user.findUnique({ where: { telegramId } })
      const lang = getLangFromDb(user)
      if (user?.githubToken) {
        const masked = user.githubToken.slice(0, 4) + '••••' + user.githubToken.slice(-4)
        bot.sendMessage(msg.chat.id, t(lang, 'currentToken', masked))
      } else {
        bot.sendMessage(msg.chat.id, t(lang, 'noToken'))
      }
      return
    }

    const lang = await getUserLang(telegramId)

    if (token.length < 10) {
      bot.sendMessage(msg.chat.id, t(lang, 'tokenTooShort'))
      return
    }

    await prisma.user.update({
      where: { telegramId },
      data: { githubToken: token },
    })

    bot.sendMessage(msg.chat.id, t(lang, 'tokenSaved'))
  })

  bot.onText(/\/help/, async (msg) => {
    const telegramId = String(msg.from?.id ?? '')
    const lang = telegramId ? await getUserLang(telegramId) : 'en'
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/help from ${user}`)
    bot.sendMessage(msg.chat.id, t(lang, 'helpText'))
  })

  bot.onText(/\/language/, async (msg) => {
    const telegramId = String(msg.from?.id)
    await upsertUser(telegramId, msg)
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { language: true },
    })
    const newLang = (user?.language || 'en') === 'en' ? 'es' : 'en'
    await prisma.user.update({
      where: { telegramId },
      data: { language: newLang },
    })
    bot.sendMessage(
      msg.chat.id,
      newLang === 'en' ? '✅ Language set to English.' : '✅ Idioma cambiado a Español.',
    )
  })

  bot.on('callback_query', async (query) => {
    const telegramId = String(query.from?.id)
    const user = query.from?.username ?? query.from?.id
    const lang = await getUserLang(telegramId)
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
          t(lang, 'nightdevActivated'),
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: t(lang, 'btnSetupGithub'), callback_data: 'repo_ask' },
                  { text: t(lang, 'btnNotNow'), callback_data: 'repo_skip' },
                ],
              ],
            },
          },
        )
      } else if (query.data === 'config_ownkey') {
        pendingConfig.set(telegramId, { step: 'provider' })
        bot.sendMessage(
          query.message?.chat.id!,
          t(lang, 'selectProvider'),
          { reply_markup: buildProviderKeyboard(lang) },
        )
      } else if (query.data.startsWith('config_provider:')) {
        const providerId = query.data.split(':')[1]
        const provider = PROVIDERS.find((p) => p.id === providerId)

        if (!provider) {
          bot.sendMessage(query.message?.chat.id!, t(lang, 'invalidProvider'))
          return
        }

        pendingConfig.set(telegramId, { step: 'apikey', provider: providerId })

        const hint = provider.prefix
          ? (lang === 'en'
            ? ` (starts with "${provider.prefix}")`
            : ` (comienza con "${provider.prefix}")`)
          : ''
        bot.sendMessage(
          query.message?.chat.id!,
          t(lang, 'sendApiKey', provider.emoji, provider.name, hint),
        )
      } else if (query.data === 'config_cancel') {
        pendingConfig.delete(telegramId)
        bot.sendMessage(query.message?.chat.id!, t(lang, 'configCancelled'))
      }
    }

    if (query.data === 'repo_ask') {
      bot.answerCallbackQuery(query.id)
      pendingConfig.set(telegramId, { step: 'repo' })
      bot.sendMessage(
        query.message?.chat.id!,
        t(lang, 'askRepoUrl'),
      )
    }

    if (query.data === 'repo_skip') {
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(query.message?.chat.id!, t(lang, 'repoLater'))
    }

    if (query.data === 'commit_yes') {
      bot.answerCallbackQuery(query.id)
      const dbUser = await prisma.user.findUnique({ where: { telegramId } })
      const commitLang = getLangFromDb(dbUser)

      if (!dbUser?.githubRepo) {
        bot.sendMessage(query.message?.chat.id!, t(commitLang, 'noRepoConfigured'))
        return
      }
      if (!dbUser.githubDeployKeyDone) {
        bot.sendMessage(query.message?.chat.id!, t(commitLang, 'setupDeployKeyFirst'))
        return
      }

      const msg = await bot.sendMessage(
        query.message?.chat.id!,
        t(commitLang, 'pushingToGithub'),
      )

      try {
        const result = await openclaw.sendMessage(
          `commit the code in the workspace to the repository ${dbUser.githubRepo} on branch ${dbUser.githubBranch}. use git add -A, commit with a descriptive message, and push.`,
          telegramId,
        )
        await bot.editMessageText(result.text || t(commitLang, 'codePushed'), {
          chat_id: query.message?.chat.id!,
          message_id: msg.message_id,
        })
      } catch (err) {
        logger.error('Commit failed', err)
        await bot.editMessageText(t(commitLang, 'codePushError'), {
          chat_id: query.message?.chat.id!,
          message_id: msg.message_id,
        })
      }
    }

    if (query.data === 'commit_no') {
      bot.answerCallbackQuery(query.id)
      bot.sendMessage(query.message?.chat.id!, t(lang, 'codeNotPushed'))
    }

    if (query.data === 'deploykey_show') {
      bot.answerCallbackQuery(query.id)
      try {
        const result = await openclaw.getDeployKey()
        if (result.ok && result.public_key) {
          bot.sendMessage(
            query.message?.chat.id!,
            t(lang, 'deployKeySetup', result.public_key),
            { parse_mode: 'Markdown' },
          )
          pendingConfig.set(telegramId, { step: 'repourl' })
        }
      } catch {
        bot.sendMessage(query.message?.chat.id!, t(lang, 'deployKeyFetchError'))
      }
    }
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return

    const telegramId = String(msg.from?.id)
    const lang = await getUserLang(telegramId)
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
        bot.sendMessage(msg.chat.id, t(lang, 'deployKeyDone'))
      } else {
        bot.sendMessage(msg.chat.id, t(lang, 'typeDoneConfirm'))
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
        bot.sendMessage(msg.chat.id, t(lang, 'repoGithubOnlyRetry'))
        return
      }

      const repoBlocked = await checkRepoAbuse(url, telegramId)
      if (repoBlocked) {
        bot.sendMessage(msg.chat.id, t(lang, 'repoBlockedRetry'))
        pendingConfig.delete(telegramId)
        return
      }

      pendingConfig.delete(telegramId)
      const statusMsg = await bot.sendMessage(msg.chat.id, t(lang, 'configuringRepo'))

      try {
        const result = await openclaw.setRepo(telegramId, url, 'main')
        if (!result.ok) {
          await bot.editMessageText(t(lang, 'repoConfigError', result.error || 'desconocido'), {
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
          ? t(lang, 'repoConfiguredWithKey', result.public_key)
          : t(lang, 'repoConfiguredSimple', url)

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
        await bot.editMessageText(t(lang, 'bridgeError'), {
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
        bot.sendMessage(msg.chat.id, t(lang, 'internalErrorRetry'))
        pendingConfig.delete(telegramId)
        return
      }

      if (apiKey.length < 10) {
        bot.sendMessage(msg.chat.id, t(lang, 'apiKeyTooShort'))
        return
      }

      if (provider.prefix && !apiKey.startsWith(provider.prefix)) {
        bot.sendMessage(msg.chat.id, t(lang, 'apiKeyWrongPrefix', provider.prefix))
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

      const statusMsg = await bot.sendMessage(msg.chat.id, t(lang, 'updatingContainer'))

      try {
        const result = await openclaw.updateUserConfig(telegramId, config.provider, apiKey)
        await bot.editMessageText(
          t(lang, 'containerUpdated', `${provider.emoji} ${provider.name}`),
          { chat_id: msg.chat.id, message_id: statusMsg.message_id },
        )
      } catch {
        await bot.editMessageText(
          t(lang, 'containerUpdateFailed', `${provider.emoji} ${provider.name}`),
          { chat_id: msg.chat.id, message_id: statusMsg.message_id },
        )
      }
    }
  })
}
