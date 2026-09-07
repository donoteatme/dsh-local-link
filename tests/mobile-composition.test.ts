import { describe, expect, it } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '../src/client-context.js'
import { applyResponsiveMobileEnhancements } from '../src/mobile-layout.js'

type Register = (options: Record<string, unknown>, component: () => null) => () => void

const MOBILE_TARGETS = {
  'shell.overlay': { kind: 'list', scope: 'root' },
  'sidebar.settings': { kind: 'single', scope: 'root' },
  'sidebar.footer.action': { kind: 'list', scope: 'root' },
  'conversation.input.dock': { kind: 'list', scope: 'session' },
  'conversation.session.header.lineage': { kind: 'single', scope: 'session' },
  'conversation.session.header.actions': { kind: 'list', scope: 'session' },
  'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
  'conversation.composer.dock': { kind: 'list', scope: 'session' },
} as const

function compositionHarness(): {
  readonly core: SlotCore
  readonly context: ClientContext
  readonly disposeMobile: () => void
  readonly disposeStock: () => void
} {
  const core = new SlotCore()
  const register = core.register.bind(core) as unknown as Register
  const disposeRoot = register({ name: 'root', children: MOBILE_TARGETS }, () => null)
  const stockDisposers = [
    register({ name: 'sidebar.settings' }, () => null),
    register({ name: 'conversation.session.header.lineage' }, () => null),
    register({ name: 'conversation.session.header.actions', id: 'agent-preset' }, () => null),
    register({ name: 'conversation.session.header.utilities', id: 'session-log-download' }, () => null),
    register({ name: 'conversation.composer.dock', id: 'stats' }, () => null),
  ]
  const mobileDisposers: Array<() => void> = []
  const context = {
    slots: {
      inject: (_name: string, mount: () => () => void) => mount(),
      register,
    },
    effect: (mount: () => void | (() => void), label?: string) => {
      if (label?.includes('styles') === true || label?.includes('autofocus') === true
        || label?.includes('close stock mobile sidebar') === true) return
      const dispose = mount()
      if (typeof dispose === 'function') mobileDisposers.push(dispose)
    },
    inject: () => undefined,
    locale: { bind: () => (key: string, params?: Record<string, unknown>) => `${key}${params === undefined ? '' : JSON.stringify(params)}` },
    theme: {
      getTheme: () => ({ preference: 'system', active: { colorScheme: 'dark', tokens: {} } }),
      setTheme: () => undefined,
    },
    on: () => () => undefined,
    sessions: {
      setSubagentCatalogOpen: () => undefined,
      openSubagent: () => undefined,
      refreshSubagents: () => undefined,
    },
    sessionLogDownload: { download: async () => undefined },
    layout: { toggleSidebar: () => undefined, openDetails: () => undefined, closeDetails: () => undefined },
  } as unknown as ClientContext

  return {
    core,
    context,
    disposeMobile: () => {
      for (const dispose of mobileDisposers.splice(0).reverse()) dispose()
    },
    disposeStock: () => {
      for (const dispose of stockDisposers.reverse()) dispose()
      disposeRoot()
    },
  }
}

describe('native Harness mobile composition', () => {
  it('mounts one responsive contribution set into the shipped slot graph', () => {
    const harness = compositionHarness()
    applyResponsiveMobileEnhancements(harness.context)

    expect(harness.core.entries('shell.overlay').map(entry => entry.options.id)).toEqual([
      'dsh-local-link-mobile-controls',
      'dsh-local-link.mobile-subagent-sheet',
      'dsh-local-link.mobile-session-info-drawer',
    ])
    expect(harness.core.entries('conversation.input.dock')).toHaveLength(1)
    expect(harness.core.entries('conversation.session.header.lineage')).toHaveLength(2)
    expect(harness.core.entries('conversation.session.header.actions')).toHaveLength(2)
    expect(harness.core.entries('conversation.session.header.utilities')).toHaveLength(3)
    expect(harness.core.entries('conversation.composer.dock')).toHaveLength(2)

    harness.disposeMobile()
    expect(harness.core.entries('shell.overlay')).toHaveLength(0)
    expect(harness.core.entries('conversation.input.dock')).toHaveLength(0)
    expect(harness.core.entries('conversation.session.header.lineage')).toHaveLength(1)
    expect(harness.core.entries('conversation.session.header.actions')).toHaveLength(1)
    expect(harness.core.entries('conversation.session.header.utilities')).toHaveLength(1)
    expect(harness.core.entries('conversation.composer.dock')).toHaveLength(1)
    harness.disposeStock()
  })

  it('fails loudly if a second mobile lifecycle tries to register the same cells', () => {
    const harness = compositionHarness()
    applyResponsiveMobileEnhancements(harness.context)
    expect(() => applyResponsiveMobileEnhancements(harness.context)).toThrow(/already has/u)
    harness.disposeMobile()
    harness.disposeStock()
  })
})
