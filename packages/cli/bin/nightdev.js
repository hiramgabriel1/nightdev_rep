#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { createInterface } from 'node:readline'

const CONFIG_PATH = join(homedir(), '.nightdev', 'config.json')
const DEFAULT_API_URL = 'https://nightdev-botapplication-v4nyzj-78c8a0-159-203-189-5.sslip.io'

function rl() {
  return createInterface({ input: process.stdin, output: process.stdout })
}

function ask(query) {
  const i = rl()
  return new Promise(resolve => i.question(query + ' ', (a) => { i.close(); resolve(a.trim()) }))
}

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf-8'))
  } catch { return {} }
}

async function saveConfig(config) {
  const dir = dirname(CONFIG_PATH)
  try { await access(dir) } catch {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(dir, { recursive: true })
  }
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

async function init() {
  let config = await loadConfig()
  const apiUrl = config.apiUrl || DEFAULT_API_URL

  console.log('\n  \u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e')
  console.log('  \u2502   Nightdev CLI \u2014 Setup       \u2502')
  console.log('  \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2569\n')

  let token = process.argv[3]
  if (!token || process.argv[2] !== '--token') {
    token = await ask('Enter your Telegram Bot Token (from @BotFather):')
  } else {
    console.log('\u2713 Using token from --token flag')
  }

  if (!token) {
    console.log('\u2717 Bot token is required')
    process.exit(1)
  }

  let customApi = await ask('API URL (' + apiUrl + '):')
  if (!customApi) customApi = apiUrl

  const registerUrl = customApi.replace(/\/+$/, '') + '/api/v1/register'

  try {
    const res = await fetch(registerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: token, webhookUrl: customApi }),
    })

    const data = await res.json()

    if (data.ok) {
      config.apiUrl = customApi
      config.botToken = token
      config.telegramId = String(data.telegramId || '')
      await saveConfig(config)

      console.log('\n\u2713 Bot registered successfully!')
      console.log('  Telegram ID: ' + data.telegramId)
      console.log('  Username: @' + data.username)
      console.log('  Webhook: ' + data.webhookUrl)
      console.log('\n  Your bot is now running on Nightdev infrastructure.\n')
    } else {
      console.log('\n\u2717 Registration failed: ' + (data.error || 'Unknown error'))
      process.exit(1)
    }
  } catch (err) {
    console.log('\n\u2717 Could not connect to ' + registerUrl)
    console.log('  Error: ' + (err instanceof Error ? err.message : 'Connection failed'))
    console.log('  Make sure the API URL is correct.\n')
    process.exit(1)
  }
}

async function status() {
  const config = await loadConfig()
  if (!config.botToken) {
    console.log('Not configured. Run `npx nightdev init` first.')
    process.exit(1)
  }

  const apiUrl = (config.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '')
  const statusUrl = apiUrl + '/api/v1/status?botToken=' + encodeURIComponent(config.botToken)

  try {
    const res = await fetch(statusUrl)
    const data = await res.json()

    if (data.ok && data.user) {
      const u = data.user
      console.log('\n  Bot Status')
      console.log('  Username:   @' + (u.username || 'unknown'))
      console.log('  Free tokens: ' + (u.freeTokens || 0))
      console.log('  Status:     ' + (u.blocked ? 'Blocked' : 'Active'))
      console.log('  Language:   ' + (u.language || 'en') + '\n')
    } else {
      console.log('Status error: ' + (data.error || 'Unknown') + '\n')
    }
  } catch (err) {
    console.log('Could not connect: ' + (err instanceof Error ? err.message : 'Connection failed') + '\n')
    process.exit(1)
  }
}

async function main() {
  const cmd = process.argv[2]

  switch (cmd) {
    case 'init':
      await init()
      break
    case 'status':
      await status()
      break
    case 'help':
    case '--help':
    case '-h':
    default:
      console.log('\nUsage: npx nightdev <command>\n\nCommands:\n  init                  Register a new Telegram bot\n  init --token <token>  Register with token (non-interactive)\n  status                Check bot status\n  help                  Show this help\n')
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
