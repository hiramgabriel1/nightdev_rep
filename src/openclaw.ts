import WebSocket from 'ws'
import { logger } from './logger.js'

interface GatewayMessage {
  type: string
  id?: string
  method?: string
  params?: Record<string, unknown>
  event?: string
  payload?: Record<string, unknown>
  ok?: boolean
  error?: unknown
}

class OpenClawService {
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>()
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>()
  private seq = 0

  constructor(private url: string, private token: string) {}

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url)

      this.ws.on('open', () => {
        logger.info('OpenClaw WebSocket connected')
        this.sendConnect().then(resolve).catch(reject)
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        const msg: GatewayMessage = JSON.parse(data.toString())
        this.handleMessage(msg)
      })

      this.ws.on('error', (err) => {
        logger.error('OpenClaw WebSocket error', err)
        reject(err)
      })

      this.ws.on('close', () => {
        logger.warn('OpenClaw WebSocket closed, reconnecting...')
        setTimeout(() => this.connect().catch(() => {}), 5000)
      })
    })
  }

  private sendConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = `connect-${this.nextId()}`
      this.pendingRequests.set(id, { resolve: () => resolve(), reject })

      this.ws!.send(JSON.stringify({
        type: 'req',
        id,
        method: 'connect',
        params: {
          auth: { token: this.token },
          client: { id: 'nightdev-bot', version: '1.0.0' },
        },
      }))
    })
  }

  async sendMessage(sessionKey: string, text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = `agent-${this.nextId()}`
      let responseText = ''

      const handler = (payload: unknown) => {
        const p = payload as Record<string, unknown>
        if (p.deltaText) {
          responseText += p.deltaText
        }
        if (p.message && p.message !== responseText) {
          responseText = p.message as string
        }
      }

      this.eventHandlers.set('agent', new Set([handler]))

      const timeout = setTimeout(() => {
        this.eventHandlers.delete('agent')
        resolve(responseText || 'No response received')
      }, 120000)

      this.pendingRequests.set(id, {
        resolve: () => {
          clearTimeout(timeout)
          this.eventHandlers.delete('agent')
          resolve(responseText || 'Done')
        },
        reject: (err) => {
          clearTimeout(timeout)
          this.eventHandlers.delete('agent')
          reject(err)
        },
      })

      this.ws!.send(JSON.stringify({
        type: 'req',
        id,
        method: 'agent',
        params: {
          sessionKey,
          message: text,
        },
      }))
    })
  }

  private handleMessage(msg: GatewayMessage) {
    if (msg.type === 'res' && msg.id) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        if (msg.ok) {
          pending.resolve(msg.payload)
        } else {
          pending.reject(new Error(String(msg.error)))
        }
      }
    }

    if (msg.type === 'event' && msg.event) {
      const handlers = this.eventHandlers.get(msg.event)
      handlers?.forEach((h) => h(msg.payload))
    }
  }

  private nextId() {
    return ++this.seq
  }
}

export const openclaw = new OpenClawService(
  process.env.OPENCLAW_GATEWAY_URL!,
  process.env.OPENCLAW_GATEWAY_TOKEN!,
)
