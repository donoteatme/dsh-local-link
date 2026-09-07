import {
  createServer,
  request as requestHttp,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http'
import { connect, type Socket } from 'node:net'
import { DeviceStore, type DeviceView } from '../auth/device-store.js'
import { PairingTokens, type PairingStatus } from '../auth/pairing.js'
import type { ResolvedConfig } from '../config.js'
import { DiagnosticStore, type DiagnosticCode, type DiagnosticEvent } from '../diagnostics.js'
import { allowedGatewayHost, isPrivateAddress, privateInterfaceAddresses } from '../network.js'
import { rewriteAuthenticatedIndex } from './html.js'
import { CONNECT_PATH, PAIR_PAGE, PAIR_PATH } from './pair-page.js'

const COOKIE_NAME = 'dsh_local_link_device'
const MAX_PAIR_BODY = 4096
const STREAM_PATHS = new Set(['/api/events.mux', '/api/events.host', '/api/remote.mux'])
const LOOPBACK_ONLY_RPC_METHODS = new Set([
  'host.pickDirectory',
  'host.openPath',
  'settings.describe',
  'settings.canOpenAgentPresetDirectory',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'settings.openDocument',
  'settings.openSettingsDocument',
  'settings.openAgentPresetDirectory',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
])
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
])

function formatAuthority(address: string, port: number): string {
  return `${address.includes(':') ? `[${address}]` : address}:${port}`
}

function cookieValue(request: IncomingMessage, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(value.join('='))
    } catch {
      return undefined
    }
  }
  return undefined
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_PAIR_BODY) throw new Error('body_too_large')
    chunks.push(buffer)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad_json')
  return value as Record<string, unknown>
}

function send(response: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  response.end(body)
}

function upstreamCookieHeader(request: IncomingMessage): string | undefined {
  const cookies = (request.headers.cookie ?? '').split(';')
    .map(part => part.trim())
    .filter(part => part !== '' && part.split('=', 1)[0] !== COOKIE_NAME)
  return cookies.length > 0 ? cookies.join('; ') : undefined
}

function proxyRequestHeaders(request: IncomingMessage, websocket = false): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase()
    if (value === undefined || lower === 'cookie'
      || lower.startsWith('x-forwarded-') || (!websocket && HOP_BY_HOP_HEADERS.has(lower))) continue
    headers[lower] = value
  }
  const cookie = upstreamCookieHeader(request)
  if (cookie !== undefined) headers.cookie = cookie
  return headers
}

function proxyResponseHeaders(headers: IncomingHttpHeaders, forwardSetCookie = false): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (value === undefined || HOP_BY_HOP_HEADERS.has(lower) || (lower === 'set-cookie' && !forwardSetCookie)) continue
    result[lower] = value
  }
  return result
}

function serializeHeaders(headers: OutgoingHttpHeaders): string[] {
  const lines: string[] = []
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) lines.push(`${name}: ${entry}`)
    } else lines.push(`${name}: ${String(value)}`)
  }
  return lines
}

function requestKind(pathname: string): string {
  if (pathname === '/') return 'root'
  if (STREAM_PATHS.has(pathname)) return 'events'
  if (pathname.startsWith('/api/')) return 'api'
  if (/\.[a-z0-9]{1,8}$/iu.test(pathname)) return 'asset'
  return 'page'
}

export function supportedWebSocketTarget(target: URL): boolean {
  return target.search === '' && STREAM_PATHS.has(target.pathname)
}

export function isLoopbackOnlyRpcTarget(target: URL): boolean {
  if (!target.pathname.startsWith('/api/')) return false
  try {
    return LOOPBACK_ONLY_RPC_METHODS.has(decodeURIComponent(target.pathname.slice('/api/'.length)))
  } catch {
    return true
  }
}

export class LocalGateway {
  private readonly devices: DeviceStore
  private readonly pairing: PairingTokens
  private readonly diagnostics: DiagnosticStore
  private readonly upgradedSockets = new Set<Socket>()
  private readonly deviceSockets = new Map<string, Set<Socket>>()
  private server: Server | undefined
  private addresses: string[] = []
  private browserAuthenticationUrl: ((baseUrl: string) => string) | undefined

  constructor(readonly config: ResolvedConfig) {
    this.devices = new DeviceStore(config.stateFile, config.deviceTtlMs)
    this.pairing = new PairingTokens(config.pairingTtlMs)
    this.diagnostics = new DiagnosticStore(config.diagnosticsFile, config.diagnosticsMaxEntries, config.diagnosticsEnabled)
  }

  async start(): Promise<void> {
    if (this.server !== undefined) return
    await Promise.all([this.devices.load(), this.diagnostics.load()])
    this.addresses = this.config.listenHost === '0.0.0.0' ? privateInterfaceAddresses() : [this.config.listenHost]
    if (this.addresses.length === 0) throw new Error('no private IPv4 interface is available')

    const server = createServer((request, response) => { void this.handle(request, response) })
    server.on('upgrade', (request, socket, head) => {
      void this.proxyWebSocket(request, socket as Socket, head)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.config.listenPort, this.config.listenHost, () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
  }

  pairedDevices(): readonly DeviceView[] {
    return this.devices.list()
  }

  issuePairing(sessionId?: string): { readonly id: string; readonly url: string; readonly expiresAt: string } {
    const address = this.addresses[0]
    if (address === undefined) throw new Error('gateway is not running')
    const issued = this.pairing.issue()
    return {
      id: issued.id,
      url: `http://${formatAuthority(address, this.config.listenPort)}${PAIR_PATH}#token=${encodeURIComponent(issued.token)}${sessionId === undefined ? '' : `&session=${encodeURIComponent(sessionId)}`}`,
      expiresAt: issued.expiresAt,
    }
  }

  pairingStatus(id: unknown): PairingStatus {
    return this.pairing.getStatus(id)
  }

  trustedAuthorities(): readonly string[] {
    return Object.freeze(this.addresses.map(address => formatAuthority(address, this.config.listenPort)))
  }

  attachBrowserAuthentication(factory: (baseUrl: string) => string): () => void {
    this.browserAuthenticationUrl = factory
    return () => {
      if (this.browserAuthenticationUrl === factory) this.browserAuthenticationUrl = undefined
    }
  }

  diagnosticEvents(): readonly DiagnosticEvent[] {
    return this.diagnostics.list()
  }

  clearDiagnostics(): Promise<void> {
    return this.diagnostics.clear()
  }

  recordActionError(code: Extract<DiagnosticCode,
    'PAIRING_GENERATION_FAILED' | 'CLIPBOARD_COPY_FAILED' | 'DEVICE_REVOKE_FAILED' | 'DEVICE_RENAME_FAILED'>): void {
    void this.diagnostics.record('error', code)
  }

  async revoke(id: string): Promise<boolean> {
    try {
      return await this.devices.revoke(id)
    } finally {
      this.closeDeviceSockets(id)
    }
  }

  async renameDevice(id: string, name: unknown): Promise<DeviceView | undefined> {
    return this.devices.renameDevice(id, name)
  }

  async close(): Promise<void> {
    const server = this.server
    this.server = undefined
    if (server === undefined) return
    for (const socket of this.upgradedSockets) socket.destroy()
    this.upgradedSockets.clear()
    this.deviceSockets.clear()
    await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  }

  private requestTrusted(request: IncomingMessage): boolean {
    return isPrivateAddress(request.socket.remoteAddress)
      && allowedGatewayHost(request.headers.host, this.config.listenHost, this.config.listenPort, this.addresses)
  }

  private authorized(request: IncomingMessage): boolean {
    return this.config.accessMode === 'trusted-lan'
      || this.devices.authorize(cookieValue(request, COOKIE_NAME)) !== undefined
  }

  private trackDeviceSocket(deviceId: string, socket: Socket): void {
    const sockets = this.deviceSockets.get(deviceId) ?? new Set<Socket>()
    sockets.add(socket)
    this.deviceSockets.set(deviceId, sockets)
  }

  private untrackDeviceSocket(deviceId: string, socket: Socket): void {
    const sockets = this.deviceSockets.get(deviceId)
    if (sockets === undefined) return
    sockets.delete(socket)
    if (sockets.size === 0) this.deviceSockets.delete(deviceId)
  }

  private closeDeviceSockets(deviceId: string): void {
    const sockets = this.deviceSockets.get(deviceId)
    if (sockets === undefined) return
    this.deviceSockets.delete(deviceId)
    for (const socket of sockets) socket.destroy()
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.requestTrusted(request)) {
      void this.diagnostics.record('warn', 'REQUEST_REJECTED', { reason: 'untrusted_source' })
      send(response, 403, 'Local-network request rejected')
      return
    }
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
    if (url.pathname.startsWith('/__dsh-local-link/admin')) {
      send(response, 404, 'Not found')
      return
    }
    if (url.pathname === PAIR_PATH && request.method === 'GET') {
      send(response, 200, PAIR_PAGE, 'text/html; charset=utf-8')
      return
    }
    if (url.pathname === PAIR_PATH && request.method === 'POST') {
      try {
        const body = await readJson(request)
        if (!this.pairing.consume(body.token)) {
          void this.diagnostics.record('warn', 'PAIRING_REJECTED', { reason: 'expired_or_used' })
          send(response, 410, 'Pairing token expired or already used')
          return
        }
        const credential = cookieValue(request, COOKIE_NAME)
        const existing = this.devices.authorize(credential)
        if (existing === undefined) {
          const created = await this.devices.add(body.device)
          response.setHeader('set-cookie', `${COOKIE_NAME}=${encodeURIComponent(created.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(this.config.deviceTtlMs / 1000)}`)
        }
        send(response, 204, '')
      } catch {
        void this.diagnostics.record('warn', 'PAIRING_INVALID', { reason: 'invalid_request' })
        send(response, 400, 'Invalid pairing request')
      }
      return
    }
    if (!this.authorized(request)) {
      const kind = requestKind(url.pathname)
      if (kind === 'root' || kind === 'page') {
        void this.diagnostics.record('warn', 'AUTH_REQUIRED', {
          method: request.method ?? 'UNKNOWN',
          requestKind: kind,
        })
      }
      send(response, 401, 'This browser is not paired. Open Local access in the computer sidebar and scan its QR code.')
      return
    }
    if (url.pathname === CONNECT_PATH && request.method === 'GET') {
      const authenticationUrl = this.browserAuthenticationUrl
      if (authenticationUrl === undefined) {
        response.writeHead(303, { location: '/', 'cache-control': 'no-store' })
        response.end()
        return
      }
      try {
        const origin = new URL(`http://${request.headers.host ?? ''}`)
        const target = new URL(authenticationUrl(origin.href))
        if (target.origin !== origin.origin || target.pathname !== '/' || target.hash !== '') {
          throw new Error('invalid authentication handoff')
        }
        response.writeHead(303, {
          location: `${target.pathname}${target.search}`,
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
        })
        response.end()
      } catch {
        void this.diagnostics.record('error', 'BROWSER_AUTH_HANDOFF_FAILED', { reason: 'invalid_target' })
        send(response, 502, 'DeepSeek Harness browser authentication is unavailable')
      }
      return
    }
    if (isLoopbackOnlyRpcTarget(url)) {
      void this.diagnostics.record('warn', 'REQUEST_REJECTED', { reason: 'loopback_only_rpc' })
      send(response, 403, 'This DeepSeek Harness action is available only on the host computer.')
      return
    }
    const interceptIndex = request.method === 'GET' && url.pathname === '/'
    this.proxyHttp(request, response, interceptIndex, interceptIndex && url.searchParams.has('token'))
  }

  private proxyHttp(request: IncomingMessage, response: ServerResponse, interceptIndex: boolean, browserTokenExchange: boolean): void {
    const headers = proxyRequestHeaders(request)
    if (interceptIndex) headers['accept-encoding'] = 'identity'
    const upstreamRequest = requestHttp({
      hostname: this.config.upstreamOrigin.hostname,
      port: Number(this.config.upstreamOrigin.port),
      method: request.method,
      path: request.url,
      headers,
      agent: false,
    }, (upstreamResponse) => {
      if (!interceptIndex || !String(upstreamResponse.headers['content-type'] ?? '').includes('text/html')) {
        response.writeHead(upstreamResponse.statusCode ?? 502, proxyResponseHeaders(upstreamResponse.headers, browserTokenExchange))
        upstreamResponse.pipe(response)
        return
      }
      const chunks: Buffer[] = []
      upstreamResponse.on('data', chunk => chunks.push(Buffer.from(chunk)))
      upstreamResponse.on('end', () => {
        try {
          const body = rewriteAuthenticatedIndex(Buffer.concat(chunks).toString('utf8'))
          const outgoing = proxyResponseHeaders(upstreamResponse.headers)
          delete outgoing['content-length']
          delete outgoing['content-encoding']
          outgoing['content-length'] = Buffer.byteLength(body)
          outgoing['cache-control'] = 'no-store'
          response.writeHead(upstreamResponse.statusCode ?? 502, outgoing)
          response.end(body)
        } catch (error) {
          void this.diagnostics.record('error', 'INDEX_REWRITE_ERROR', { reason: 'rewrite_failed' })
          if (!response.headersSent) send(response, 502, error instanceof Error ? error.message : 'index rewrite failed')
          else response.destroy()
        }
      })
    })
    upstreamRequest.once('error', () => {
      void this.diagnostics.record('error', 'HTTP_UPSTREAM_ERROR', { requestKind: requestKind(new URL(request.url ?? '/', this.config.upstreamOrigin).pathname) })
      if (!response.headersSent) send(response, 502, 'DeepSeek Harness is unavailable')
      else response.destroy()
    })
    request.pipe(upstreamRequest)
  }

  private async proxyWebSocket(request: IncomingMessage, client: Socket, head: Buffer): Promise<void> {
    const trusted = this.requestTrusted(request)
    const device = this.config.accessMode === 'pairing'
      ? this.devices.authorize(cookieValue(request, COOKIE_NAME))
      : undefined
    const authorized = trusted && (this.config.accessMode === 'trusted-lan' || device !== undefined)
    if (!trusted || !authorized) {
      void this.diagnostics.record('warn', 'WS_REJECTED', { reason: trusted ? 'unauthorized' : 'untrusted_source' })
      client.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      return
    }
    const target = new URL(request.url ?? '/', this.config.upstreamOrigin)
    if (!supportedWebSocketTarget(target)) {
      void this.diagnostics.record('warn', 'WS_REJECTED', { reason: 'unsupported_path' })
      client.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    const upstream = connect(Number(this.config.upstreamOrigin.port), this.config.upstreamOrigin.hostname)
    this.upgradedSockets.add(client)
    this.upgradedSockets.add(upstream)
    if (device !== undefined) {
      this.trackDeviceSocket(device.id, client)
      this.trackDeviceSocket(device.id, upstream)
    }
    const cleanup = (): void => {
      this.upgradedSockets.delete(client)
      this.upgradedSockets.delete(upstream)
      if (device !== undefined) {
        this.untrackDeviceSocket(device.id, client)
        this.untrackDeviceSocket(device.id, upstream)
      }
    }
    client.once('close', cleanup)
    upstream.once('close', cleanup)
    client.once('error', () => upstream.destroy())
    upstream.once('error', () => {
      void this.diagnostics.record('error', 'WS_UPSTREAM_ERROR', { reason: 'connect_failed' })
      if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    })
    upstream.once('connect', () => {
      const headers = proxyRequestHeaders(request, true)
      upstream.write([
        `${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/1.1`,
        ...serializeHeaders(headers),
        '',
        '',
      ].join('\r\n'))
      if (head.length > 0) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
      client.resume()
    })
  }
}
