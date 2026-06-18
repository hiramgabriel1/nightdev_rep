import https from 'node:https'
import http from 'node:http'
import { logger } from '../core/logger.js'

type AgentId = 'main'

class OpenClawService {
  constructor(
    private host: string,
    private port: number,
    private bridgeToken: string,
    private useHttps: boolean = false,
  ) {}

  async connect() {
    logger.info(`OpenClaw bridge connected at ${this.host}:${this.port}`)
  }

  async sendMessage(text: string, agent: AgentId = 'main'): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ message: text, agent })
      const client = this.useHttps ? https : http

      const req = client.request(
        `${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bridgeToken}`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 120000,
        },
        (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            if (res.statusCode !== 200) {
              logger.error(`Bridge returned ${res.statusCode}: ${data}`)
              reject(new Error(`Bridge error ${res.statusCode}: ${data}`))
              return
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.ok) {
                resolve(parsed.text)
              } else {
                reject(new Error(parsed.error || 'Unknown error'))
              }
            } catch (err) {
              reject(new Error(`Invalid JSON response: ${data}`))
            }
          })
        },
      )

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Bridge request timeout'))
      })
      req.write(body)
      req.end()
    })
  }
}

export const openclaw = new OpenClawService(
  process.env.OPENCLAW_BRIDGE_HOST || '159.203.189.5',
  parseInt(process.env.OPENCLAW_BRIDGE_PORT || '18790', 10),
  process.env.OPENCLAW_BRIDGE_TOKEN || 'nightdev-bridge-2026',
  process.env.OPENCLAW_BRIDGE_HTTPS === '1',
)
