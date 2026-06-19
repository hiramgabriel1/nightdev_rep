import https from 'node:https'
import http from 'node:http'
import { logger } from '../core/logger.js'

type BridgeResponse = {
  ok: boolean
  text?: string
  pipeline_type?: 'conversation' | 'build'
  error?: string
  public_key?: string
  repo?: string
  branch?: string
}

class OpenClawService {
  constructor(
    private host: string,
    private port: number,
    private bridgeToken: string,
    private useHttps: boolean = false,
  ) {}

  private _request(body: Record<string, unknown>, timeout = 120000): Promise<BridgeResponse> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body)
      const client = this.useHttps ? https : http

      const req = client.request(
        `${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bridgeToken}`,
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout,
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
              resolve(JSON.parse(data))
            } catch {
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
      req.write(payload)
      req.end()
    })
  }

  async connect() {
    logger.info(`OpenClaw bridge connected at ${this.host}:${this.port}`)
  }

  async sendMessage(text: string, userId?: string, username?: string, provider?: string, providerApiKey?: string): Promise<BridgeResponse> {
    return this._request({
      message: text,
      user_id: userId,
      username: username || 'unknown',
      ...(provider ? { provider, provider_api_key: providerApiKey } : {}),
    }, 180000)
  }

  async updateUserConfig(userId: string, provider: string, apiKey: string): Promise<BridgeResponse> {
    return this._request({
      action: 'update_config',
      user_id: userId,
      provider,
      provider_api_key: apiKey,
    })
  }

  async setRepo(userId: string, repoUrl: string, branch = 'main'): Promise<BridgeResponse> {
    return this._request({
      action: 'set_repo',
      user_id: userId,
      github_repo: repoUrl,
      github_branch: branch,
    })
  }

  async getDeployKey(): Promise<BridgeResponse> {
    return this._request({
      action: 'get_deploykey',
      user_id: 'system',
    })
  }

  async commitCode(userId: string, commitMessage: string): Promise<BridgeResponse> {
    return this._request({
      action: 'commit',
      user_id: userId,
      message: commitMessage,
    }, 180000)
  }
}

export const openclaw = new OpenClawService(
  process.env.OPENCLAW_BRIDGE_HOST || '159.203.189.5',
  parseInt(process.env.OPENCLAW_BRIDGE_PORT || '18790', 10),
  process.env.OPENCLAW_BRIDGE_TOKEN || 'nightdev-bridge-2026',
  process.env.OPENCLAW_BRIDGE_HTTPS === '1',
)
