import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { rewriteAuthenticatedIndex } from '../src/gateway/html.js'
import { CONNECT_PATH, PAIR_PAGE } from '../src/gateway/pair-page.js'

function index(entries: unknown[], batches?: unknown[]): string {
  return `<html><head><script>window.__DSH_BOOT__ = ${JSON.stringify({ rev: 'test', entries, ...(batches === undefined ? {} : { batches }) })};</script></head></html>`
}

describe('rewriteAuthenticatedIndex', () => {
  it('adds only the LAN crypto fallback and responsive viewport around the stock boot graph', () => {
    const result = rewriteAuthenticatedIndex(index([
      { id: 'dsh-local-link', inject: [] },
      { id: '@deepseek-ai/dsh-client-ui-settings', inject: ['connection'] },
    ]))
    expect(result).toContain('window.crypto.getRandomValues')
    expect(result.indexOf('window.crypto.getRandomValues')).toBeLessThan(result.indexOf('window.__DSH_BOOT__'))
    expect(result).toContain('viewport-fit=cover')
    expect(result).not.toContain('dsh_local_link_view')
    expect(result).not.toContain('__DSH_LOCAL_LINK_AUTHENTICATED__')
    expect(result).toContain('"inject":["connection"]')
  })

  it('fails closed when the client plugin is missing', () => {
    expect(() => rewriteAuthenticatedIndex(index([
      { id: '@deepseek-ai/dsh-client-ui-settings', inject: ['connection'] },
    ]))).toThrow(/absent/u)
  })

  it('leaves unrelated HTML untouched', () => {
    expect(rewriteAuthenticatedIndex('<html>plain</html>')).toBe('<html>plain</html>')
  })

  it('keeps the stock root and third-party views while removing remote Host directory pickers', () => {
    const result = rewriteAuthenticatedIndex(index([
      { id: 'dsh-local-link', url: '/plugins/local-link.js', rev: 'local-link', inject: [] },
      { id: '@deepseek-ai/dsh-client-ui-settings', url: '/plugins/settings.js', rev: 'settings', inject: ['connection'] },
      {
        id: '@deepseek-ai/dsh-client-ui-layout',
        url: '/plugins/layout.js',
        rev: 'stock-layout',
        inject: ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-theme'],
      },
      { id: '@deepseek-ai/dsh-client-ui-directory-picker-native', url: '/plugins/native-picker.js', rev: 'native-picker' },
      { id: '@deepseek-ai/dsh-client-ui-directory-picker-browse', url: '/plugins/browser-picker.js', rev: 'browser-picker' },
      { id: 'third-party-view', url: '/plugins/view.js', rev: 'view', inject: ['@deepseek-ai/dsh-client-ui-conversation'] },
    ]))
    expect(result).toContain('viewport-fit=cover')
    expect(result).toContain('"id":"@deepseek-ai/dsh-client-ui-layout","url":"/plugins/layout.js","rev":"stock-layout"')
    expect(result).not.toContain('/__dsh-local-link/mobile-layout.js')
    expect(result).not.toContain('__DSH_LOCAL_LINK_MOBILE__')
    expect(result).not.toContain('@deepseek-ai/dsh-client-ui-directory-picker-native')
    expect(result).not.toContain('@deepseek-ai/dsh-client-ui-directory-picker-browse')
    expect(result).toContain('"id":"third-party-view","url":"/plugins/view.js","rev":"view"')
  })

  it('removes Host directory pickers from every authenticated gateway page', () => {
    const result = rewriteAuthenticatedIndex(index([
      { id: 'dsh-local-link', inject: [] },
      { id: '@deepseek-ai/dsh-client-ui-settings', inject: ['connection'] },
      { id: '@deepseek-ai/dsh-client-ui-directory-picker-native', url: '/plugins/native-picker.js', rev: 'native-picker' },
    ]))
    expect(result).not.toContain('@deepseek-ai/dsh-client-ui-directory-picker-native')
  })

  it('keeps alpha application batches aligned when removing native directory pickers', () => {
    const result = rewriteAuthenticatedIndex(index([
      { id: 'dsh-local-link' },
      { id: '@deepseek-ai/dsh-client-ui-workspace' },
      { id: '@deepseek-ai/dsh-client-ui-directory-picker-native' },
    ], [{
      phase: 'application',
      url: '/plugins/??@deepseek-ai/dsh-client-ui-workspace/client.js,@deepseek-ai/dsh-client-ui-directory-picker-native/client.js&rev=alpha',
      entries: ['@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-client-ui-directory-picker-native'],
    }]))
    const source = result.match(/window\.__DSH_BOOT__\s*=\s*(\{.*?\});/u)?.[1]
    const manifest = JSON.parse(source ?? '{}') as { entries?: Array<{ id?: string }>; batches?: Array<{ entries?: string[]; url?: string }> }
    expect(manifest.entries?.map(entry => entry.id)).not.toContain('@deepseek-ai/dsh-client-ui-directory-picker-native')
    expect(manifest.batches?.[0]?.entries).toEqual(['@deepseek-ai/dsh-client-ui-workspace'])
    expect(manifest.batches?.[0]?.url).toContain('@deepseek-ai/dsh-client-ui-directory-picker-native/client.js')
  })

  it('does not inspect or replace the shipped layout contract', () => {
    const result = rewriteAuthenticatedIndex(index([
      { id: 'dsh-local-link', inject: [] },
      { id: '@deepseek-ai/dsh-client-ui-settings', inject: ['connection'] },
      { id: '@deepseek-ai/dsh-client-ui-layout', url: '/layout.js', rev: 'layout', inject: [] },
    ]))
    expect(result).toContain('"id":"@deepseek-ai/dsh-client-ui-layout","url":"/layout.js","rev":"layout","inject":[]')
  })
})

describe('automatic connection page', () => {
  it('connects immediately without a confirmation form', () => {
    expect(PAIR_PAGE).toContain("void (async()=>")
    expect(PAIR_PAGE).toContain('new XMLHttpRequest()')
    expect(PAIR_PAGE).toContain('request.timeout=12000')
    expect(PAIR_PAGE).toContain('request.ontimeout=')
    expect(PAIR_PAGE).toContain("localStorage.setItem('dsh.sessions.current'")
    expect(PAIR_PAGE).toContain(`location.replace('${CONNECT_PATH}')`)
    expect(PAIR_PAGE).toContain("device:{type,browser}")
    expect(PAIR_PAGE).not.toContain('await fetch(')
    expect(PAIR_PAGE).not.toContain('<form')
    expect(PAIR_PAGE).not.toContain('Pair this device')
  })

  it('still pairs and redirects when History API cleanup is unavailable', async () => {
    const script = PAIR_PAGE.match(/<script>([\s\S]+)<\/script>/u)?.[1]
    expect(script).toBeTruthy()
    const message = { textContent: '' }
    const output = { textContent: '' }
    let redirected = ''
    let stored = ''
    class SuccessfulRequest {
      status = 204
      timeout = 0
      onload: (() => void) | undefined
      onerror: (() => void) | undefined
      ontimeout: (() => void) | undefined
      open(): void {}
      setRequestHeader(): void {}
      send(): void { this.onload?.() }
    }
    runInNewContext(script ?? '', {
      document: {
        documentElement: { lang: '' },
        title: '',
        getElementById: (id: string) => id === 'status' ? output : message,
        querySelector: () => ({ remove: () => undefined }),
      },
      location: {
        hash: '#token=test-token&session=session-123',
        pathname: '/__dsh-local-link/pair',
        replace: (value: string) => { redirected = value },
      },
      history: { replaceState: () => { throw new Error('unavailable') } },
      navigator: { languages: ['en-US'], userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile' },
      localStorage: { setItem: (_key: string, value: string) => { stored = value } },
      XMLHttpRequest: SuccessfulRequest,
      URLSearchParams,
    })
    await new Promise(resolve => setImmediate(resolve))
    expect({ redirected, stored, status: output.textContent }).toEqual({
      redirected: CONNECT_PATH,
      stored: expect.stringContaining('session-123'),
      status: '',
    })
  })

  it('uses the connecting browser language before Harness locale services load', async () => {
    const script = PAIR_PAGE.match(/<script>([\s\S]+)<\/script>/u)?.[1]
    const message = { textContent: '' }
    const output = { textContent: '' }
    const documentElement = { lang: '' }
    runInNewContext(script ?? '', {
      document: {
        documentElement,
        title: '',
        getElementById: (id: string) => id === 'status' ? output : message,
        querySelector: () => ({ remove: () => undefined }),
      },
      location: { hash: '', pathname: '/__dsh-local-link/pair' },
      history: { replaceState: () => undefined },
      navigator: { languages: ['zh-CN'], userAgent: 'Mozilla/5.0' },
      URLSearchParams,
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(documentElement.lang).toBe('zh')
    expect(message.textContent).toBe('正在连接此设备…')
    expect(output.textContent).toBe('此连接链接不完整。')
  })
})
