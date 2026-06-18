import 'dotenv/config'
import inquirer from 'inquirer'
import { render } from 'oh-my-logo'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = join(__dirname, '..', '.nightdev-config.json')
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

interface LocalConfig {
  provider?: string
  providerApiKey?: string
  telegramBotToken?: string
  useOurService: boolean
  githubRepo?: string
  githubBranch?: string
  githubDeployKeyDone?: boolean
}

const PROVIDERS = [
  { id: 'openclaw', name: 'OpenClaw', emoji: '🦞', prefix: 'sk-' },
  { id: 'anthropic', name: 'Claude Code (Anthropic)', emoji: '🧠', prefix: 'sk-ant-' },
  { id: 'openai', name: 'OpenAI (GPT)', emoji: '🤖', prefix: 'sk-' },
  { id: 'google', name: 'Google Gemini', emoji: '💎', prefix: 'AIza' },
  { id: 'deepseek', name: 'DeepSeek', emoji: '🐋', prefix: 'sk-' },
  { id: 'mistral', name: 'Mistral', emoji: '🌬️', prefix: '' },
  { id: 'groq', name: 'Groq', emoji: '⚡', prefix: 'gsk_' },
  { id: 'together', name: 'Together AI', emoji: '🤝', prefix: '' },
  { id: 'perplexity', name: 'Perplexity', emoji: '🔍', prefix: 'pplx-' },
  { id: 'xai', name: 'xAI (Grok)', emoji: '', prefix: 'xai-' },
]

function loadConfig(): LocalConfig {
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      return { useOurService: false }
    }
  }
  return { useOurService: false }
}

function saveConfig(config: LocalConfig) {
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

async function showWelcome() {
  console.clear()
  console.log('\n')
  const logo = await render('Nightdev')
  console.log(logo)
  console.log('   Build software from your pocket')
  console.log('\n')
}

function showConfigStatus(config: LocalConfig) {
  console.log(' Current configuration:')
  console.log('─'.repeat(40))

  if (config.provider && config.providerApiKey) {
    const provider = PROVIDERS.find((p) => p.id === config.provider)
    const masked = config.providerApiKey.slice(0, 4) + '••••' + config.providerApiKey.slice(-4)
    console.log(`   Provider: ${provider?.emoji} ${provider?.name || config.provider}`)
    console.log(`   API Key: ${masked}`)
  } else {
    console.log('   Provider: Not configured')
    console.log('   API Key: Not configured')
  }

  if (config.telegramBotToken) {
    const masked = config.telegramBotToken.slice(0, 6) + '••••' + config.telegramBotToken.slice(-4)
    console.log(`   Telegram Bot Token: ${masked}`)
  } else {
    console.log('   Telegram Bot Token: Not configured')
  }

  console.log(`   Mode: ${config.useOurService ? 'Nightdev (orchestrator)' : 'Own API key'}`)

  if (config.githubRepo) {
    console.log(`   GitHub Repo: ${config.githubRepo}`)
    console.log(`   Branch: ${config.githubBranch || 'main'}`)
    console.log(`   Deploy key: ${config.githubDeployKeyDone ? '✅ configured' : '❌ pending'}`)
  }

  console.log('─'.repeat(40))
  console.log()
}

async function mainMenu(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

  type MainMenuAction = 'configure' | 'exit'

  const { action } = await inquirer.prompt<{ action: MainMenuAction }>([
    {
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Configure', value: 'configure' },
        { name: 'Exit', value: 'exit' },
      ],
    },
  ])

  if (action === 'exit') {
    console.log('\n Goodbye!\n')
    return
  }

  await configureMenu()
}

async function configureMenu(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

  type ConfigureAction = 'own_key' | 'nightdev' | 'back'

  const { action } = await inquirer.prompt<{ action: ConfigureAction }>([
    {
      type: 'select',
      name: 'action',
      message: 'Configure usage:',
      choices: [
        { name: 'Use my own API key for models', value: 'own_key' },
        { name: 'Use Nightdev resources and models', value: 'nightdev' },
        { name: 'Back to previous menu', value: 'back' },
      ],
    },
  ])

  if (action === 'back') {
    await mainMenu()
    return
  }

  if (action === 'own_key') {
    await providerSelectionMenu()
  } else if (action === 'nightdev') {
    config.useOurService = true
    config.provider = undefined
    config.providerApiKey = undefined
    saveConfig(config)
    console.log('\n✅ All set! You will now use Nightdev resources and models.')
    console.log('   Just tell me what you want to build and the agent will do it for you.\n')
    await telegramSetupStep()
    await githubSetupStep()
  }
}

async function providerSelectionMenu(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

  const choices = PROVIDERS.map((p) => ({
    name: `${p.emoji} ${p.name}`,
    value: p.id,
  }))

  choices.push({ name: 'Back to previous menu', value: 'back' })

  const { provider } = await inquirer.prompt<{ provider: string }>([
    {
      type: 'select',
      name: 'provider',
      message: 'Select your model provider:',
      choices,
    },
  ])

  if (provider === 'back') {
    await configureMenu()
    return
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)

  if (!selectedProvider) {
    console.log('\n❌ Invalid provider.\n')
    await providerSelectionMenu()
    return
  }

  const hint = selectedProvider.prefix
    ? ` (starts with "${selectedProvider.prefix}")`
    : ''

  const { apiKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: `Enter your ${selectedProvider.name} API key${hint}:`,
      validate: (input: string) => {
        if (input.length < 10) return 'API key must be at least 10 characters'
        if (selectedProvider.prefix && !input.startsWith(selectedProvider.prefix)) {
          return `${selectedProvider.name} API key must start with "${selectedProvider.prefix}"`
        }
        return true
      },
    },
  ])

  config.provider = provider
  config.providerApiKey = apiKey
  config.useOurService = false
  saveConfig(config)

  console.log(`\n✅ ${selectedProvider.emoji} ${selectedProvider.name} configured successfully.\n`)
  await telegramSetupStep()
}

async function telegramSetupStep(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

  console.log(' Final step: Connect your Telegram bot\n')

  const { telegramBotToken } = await inquirer.prompt([
    {
      type: 'input',
      name: 'telegramBotToken',
      message: 'Enter your Telegram Bot Token (from @BotFather):',
      validate: (input: string) => {
        if (input.trim() === '') return true
        const regex = /^\d{5,16}:[a-zA-Z0-9_-]{34,40}$/
        if (!regex.test(input)) return 'Invalid format. Should look like: 123456:ABC-DEF...'
        return true
      },
    },
  ])

  if (telegramBotToken.trim() !== '') {
    config.telegramBotToken = telegramBotToken
    saveConfig(config)
    console.log('\n✅ Telegram Bot Token saved.')
  } else {
    console.log('\n️  Telegram Bot Token skipped.')
  }

  console.log('\n✅ Telegram bot configured.\n')
}

async function githubSetupStep(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

  const { useGithub } = await inquirer.prompt<{ useGithub: boolean }>([
    {
      type: 'confirm',
      name: 'useGithub',
      message: 'Configure GitHub commits? (The agent can push code to your repo)',
      default: true,
    },
  ])

  if (!useGithub) {
    console.log('\n   OK, you can configure it later with /repo in Telegram.\n')
    console.log('\n✅ Configuration complete.\n')
    console.log(' Goodbye!\n')
    process.exit(0)
  }

  const { repoUrl } = await inquirer.prompt<{ repoUrl: string }>([
    {
      type: 'input',
      name: 'repoUrl',
      message: 'Enter your GitHub repository URL:',
      validate: (input: string) => {
        if (!input.includes('github.com')) return 'Must be a GitHub URL (e.g. https://github.com/user/repo)'
        return true
      },
    },
  ])

  // Save to database
  try {
    const user = await prisma.user.findFirst({ where: { useOurService: true } })
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { githubRepo: repoUrl, githubBranch: 'main' },
      })
    } else {
      console.log('\n⚠️  No Nightdev user found in database. /start the bot first, then use /repo to configure.\n')
    }
  } catch (err) {
    console.log('\n⚠️  Could not connect to database. The config will apply when you start the bot.\n')
    config.githubRepo = repoUrl
    config.githubBranch = 'main'
    config.githubDeployKeyDone = false
    saveConfig(config)
  }

  console.log('\n')
  console.log('──────────────────────────────────────────')
  console.log('🔑 GitHub Deploy Key Setup')
  console.log('──────────────────────────────────────────')
  console.log('')
  console.log('1. Go to your repo: Settings → Deploy keys → Add deploy key')
  console.log('2. Title: nightdev-robot')
  console.log('3. Key: When you run the bot, use /deploykey to see the SSH key.')
  console.log('4. Enable "Allow write access"')
  console.log('5. After adding it, write "listo" in Telegram.')
  console.log('')
  console.log('──────────────────────────────────────────\n')

  console.log('\n✅ GitHub configured.')
  console.log('   Start your bot with: pnpm dev')
  console.log('   Then use /deploykey in Telegram to get the SSH key.\n')

  await prisma.$disconnect()
  console.log(' Goodbye!\n')
  process.exit(0)
}

export async function startCLI() {
  await mainMenu()
}

startCLI()
