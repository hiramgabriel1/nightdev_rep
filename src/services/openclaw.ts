import { Client } from 'ssh2'
import { readFileSync } from 'node:fs'
import { logger } from '../core/logger.js'

type AgentId = 'main'

class OpenClawService {
  private conn: Client | null = null

  constructor(
    private host: string,
    private user: string,
    private privateKey: string,
    private gatewayToken: string,
  ) {}

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.conn = new Client()

      this.conn.on('ready', () => {
        logger.info('SSH connected to OpenClaw VPS')
        resolve()
      })

      this.conn.on('error', (err) => {
        logger.error('SSH connection error', err)
        reject(err)
      })

      this.conn.connect({
        host: this.host,
        port: 22,
        username: this.user,
        privateKey: this.privateKey,
      })
    })
  }

  async sendMessage(text: string, agent: AgentId = 'main'): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.conn) {
        reject(new Error('SSH not connected'))
        return
      }

      const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
      const cmd = `OPENCLAW_GATEWAY_TOKEN=${this.gatewayToken} openclaw agent --agent ${agent} --message '${escaped}'`

      this.conn!.exec(cmd, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        let output = ''
        let errorOutput = ''

        stream.on('close', (code: number) => {
          if (code !== 0) {
            logger.error(`OpenClaw command failed with code ${code}: ${errorOutput}`)
            reject(new Error(errorOutput || 'Command failed'))
            return
          }
          resolve(output.trim())
        })

        stream.on('data', (data: Buffer) => {
          output += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString()
        })
      })
    })
  }
}

export const openclaw = new OpenClawService(
  process.env.VPS_HOST || '159.203.189.5',
  process.env.VPS_USER || 'root',
  readFileSync(process.env.SSH_KEY_PATH || '.ssh_key', 'utf-8'),
  process.env.OPENCLAW_GATEWAY_TOKEN!,
)
