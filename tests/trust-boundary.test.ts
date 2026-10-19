import { request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { apply as applyConnection } from '@deepseek-ai/dsh-client-connection'
import { afterEach, describe, expect, it } from 'vitest'

const contexts: Context[] = []
afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
})

async function rpcStatus(port: number, authority: string, method: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'trust-test', method, payload: {} })
    const outgoing = request({
      hostname: '127.0.0.1',
      port,
      path: `/api/${method}`,
      method: 'POST',
      headers: {
        host: authority,
        origin: `http://${authority}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, response => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    outgoing.once('error', reject)
    outgoing.end(body)
  })
}

describe('Harness connection trust boundary', () => {
  it('allows a declared LAN authority through the RC trust fence without bypassing browser authentication', async () => {
    const context = new Context()
    contexts.push(context)
    await context.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const records = new Map<string, unknown>()
    await context.provide('credentials', {
      modifyRecord: async (key: string, mutate: (current: unknown) => Promise<unknown>) => {
        const current = records.get(key)
        const replacement = await mutate(current)
        if (replacement !== undefined) records.set(key, replacement)
        return records.get(key)
      },
    })
    await context.plugin(Object.assign(applyConnection, { inject: ['webServer', 'credentials'] }), {
      trustedHosts: ['gateway.test:3088'],
    })

    // The RC authenticates normal RPC routes before dispatch. Reaching 401
    // proves the declared gateway authority passed the Host/Origin fence.
    const port = context.webServer.port
    if (port === undefined) throw new Error('Trust-boundary test requires a TCP listener')
    expect(await rpcStatus(port, 'gateway.test:3088', 'session.list')).toBe(401)
    expect(await rpcStatus(port, 'untrusted.test:3088', 'session.list')).toBe(403)
  })

  it('wires gateway authorities into the public trustedHosts config without mutating client loopback state', async () => {
    const [patch, client] = await Promise.all([
      readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'),
      readFile(new URL('../src/client.tsx', import.meta.url), 'utf8'),
    ])
    expect(patch).toContain('inject: [localLinkGateway]')
    expect(patch).toContain('ctx.root.webStartup?.trustedHosts ?? ctx.root.webRuntime?.trustedHosts ?? []')
    expect(patch).toContain('...ctx.localLinkGateway.trustedHosts')
    expect(client).not.toMatch(/isLoopback\s*=/u)
  })

  it('preserves deployment authorities on old and new Harness startup services', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const expression = patch.match(/trustedHosts: !!js "([^"\n]+)"/u)?.[1]
    expect(expression).toBeTruthy()
    const resolveHosts = new Function('ctx', `return ${expression}`) as (ctx: unknown) => string[]
    const gateway = { trustedHosts: ['192.168.1.66:3088'] }
    expect(resolveHosts({ root: { webStartup: { trustedHosts: ['new.example'] } }, localLinkGateway: gateway }))
      .toEqual(['new.example', '192.168.1.66:3088'])
    expect(resolveHosts({ root: { webRuntime: { trustedHosts: ['old.example'] } }, localLinkGateway: gateway }))
      .toEqual(['old.example', '192.168.1.66:3088'])
    expect(resolveHosts({ root: {}, localLinkGateway: gateway })).toEqual(['192.168.1.66:3088'])
  })
})
