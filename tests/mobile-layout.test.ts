import { describe, expect, it } from 'vitest'
import * as mobileLayoutModule from '../src/mobile-layout.js'
import {
  MOBILE_LOCAL_ACCESS_PRIORITY,
  MOBILE_SETTINGS_PRIORITY,
  MOBILE_STOCK_LAYOUT_STYLES,
  MobileComposerAutofocusGuard,
  applyResponsiveMobileEnhancements,
  shouldCloseMobileSidebarForElement,
} from '../src/mobile-layout.js'
import { installResponsiveMobileLayout, MOBILE_VIEW_MEDIA_QUERY } from '../src/client.js'

class FakeMediaQueryList {
  matches: boolean
  readonly media = MOBILE_VIEW_MEDIA_QUERY
  private listener: ((event: MediaQueryListEvent) => void) | undefined

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listener = listener
  }

  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    if (this.listener === listener) this.listener = undefined
  }

  setMatches(matches: boolean): void {
    this.matches = matches
    this.listener?.({ matches } as MediaQueryListEvent)
  }
}

describe('mobile layout activation', () => {
  it('uses the documented phone and portrait-tablet breakpoint', () => {
    expect(MOBILE_VIEW_MEDIA_QUERY).toBe('(max-width: 834px)')
  })

  it('declares the stock layout service on its Cordis child fiber', () => {
    expect(applyResponsiveMobileEnhancements.inject).toContain('layout')
  })

  it('shadows the desktop Local access footer only while Mobile View is mounted', () => {
    expect(MOBILE_LOCAL_ACCESS_PRIORITY).toBeLessThan(0)
  })

  it('mounts below the breakpoint and retracts the mobile fiber above it', async () => {
    const media = new FakeMediaQueryList(true)
    let mounts = 0
    let disposals = 0
    const dispose = installResponsiveMobileLayout(media as unknown as MediaQueryList, () => {
      mounts += 1
      return { dispose: () => { disposals += 1 } }
    })

    expect(mounts).toBe(1)
    media.setMatches(false)
    await Promise.resolve()
    expect(disposals).toBe(1)
    media.setMatches(true)
    await Promise.resolve()
    expect(mounts).toBe(2)

    dispose()
    expect(disposals).toBe(2)
  })

  it('does not export a second root-layout plugin entrypoint', () => {
    expect(mobileLayoutModule).not.toHaveProperty('apply')
    expect(mobileLayoutModule).not.toHaveProperty('MOBILE_ROOT_CHILDREN')
  })

  it('activates from viewport width rather than user-agent detection', () => {
    const media = new FakeMediaQueryList(true)
    let mounts = 0
    const dispose = installResponsiveMobileLayout(media as unknown as MediaQueryList, () => {
      mounts += 1
      return { dispose: () => undefined }
    })
    expect(mounts).toBe(1)
    dispose()
  })

  it('does not mount above the breakpoint', () => {
    const media = new FakeMediaQueryList(false)
    let mounts = 0
    const dispose = installResponsiveMobileLayout(media as unknown as MediaQueryList, () => {
      mounts += 1
      return { dispose: () => undefined }
    })
    expect(mounts).toBe(0)
    dispose()
  })

  it('has no legacy mobile layout CSS export', () => {
    expect(mobileLayoutModule).not.toHaveProperty('MOBILE_LAYOUT_STYLES')
  })
})

describe('mobile root composition', () => {
  it('adapts the shipped root slot without generated class-name selectors', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('#root>[data-slot="root"]>div:has(>[data-shell-overlay])')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('>[data-slot="sidebar"]>*{width:100%!important;height:100%!important}')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toMatch(/[._][A-Za-z0-9]+_[A-Za-z0-9-]+_(?:frame|root|sidebar)/u)
  })

  it('keeps the stock mobile appearance button square beside the brand controls', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('left:calc(var(--dllm-side-drawer-width) - 76px)')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('min-width:28px!important;max-width:28px!important;height:28px!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('border-radius:50%!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[data-slot="sidebar"] button[class*="_brand"]{flex:0 0 auto!important;inline-size:max-content!important;width:max-content!important')
  })

  it('removes remote workspace creation and restores active row actions', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('button[aria-label="Add workspace"]')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('button[aria-label="添加工作区"]')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[role="treeitem"][aria-selected="true"]>span:has(button[aria-label]){display:inline-flex!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[role="tree"]>div:has([role="treeitem"][aria-selected="true"]) [role="treeitem"][aria-expanded]>span:last-child{display:inline-flex!important}')
  })

  it('leaves root declaration and dynamic conversation views owned by Harness', () => {
    expect(mobileLayoutModule).not.toHaveProperty('MOBILE_ROOT_CHILDREN')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain("name:'root'")
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('conversation.view')
  })

  it('keeps the stock conversation full-width and moves its native sidebar off-canvas', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('--dllm-side-drawer-width:min(88vw,340px)')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('--dllm-side-drawer-closed-transform:translateX(')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('grid-template-columns:minmax(0,1fr)!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('transform:var(--dllm-side-drawer-closed-transform)')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('padding-left:max(58px')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('padding-right:max(10px,env(safe-area-inset-right))')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('width:56px')
  })

  it('uses the shared Local Link hairline for plugin-owned mobile borders', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('border:var(--dsh-local-link-border-width) solid')
  })

  it('keeps the dismiss scrim full-viewport despite the compact Harness button size', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('.dllm-stock-scrim{position:absolute;inset:0 0 0 var(--dllm-side-drawer-width);width:auto;height:auto;min-height:0')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('background:var(--dsw-alias-bg-mask-1,rgb(15 23 42 / 40%))!important')
  })

  it('places one compact appearance control beside the mobile sidebar brand row', () => {
    expect(MOBILE_SETTINGS_PRIORITY).toBeLessThan(0)
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('.dllm-stock-theme{')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('.dllm-stock-theme .dllm-theme-button{')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('width:28px!important;min-width:28px!important;max-width:28px!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('transform 190ms cubic-bezier(.22,1,.36,1)')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('.dllm-stock-theme{opacity:0;visibility:hidden;transform:var(--dllm-side-drawer-closed-transform);pointer-events:none')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('.dllm-stock-theme{display:none}')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('>[data-slot="sidebar"]>*{width:100%!important;height:100%!important}')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('.dllm-theme-switch')
  })

  it('gives the brand and appearance controls separate mobile hit areas', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('button[class*="_brand"]{flex:0 0 auto!important;inline-size:max-content!important;width:max-content!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('>:first-child>button:first-child')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('-webkit-tap-highlight-color')
  })

  it('keeps the native overflow action visible and touchable on every session row', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[role="treeitem"][aria-selected="true"]>span:has(button[aria-label]){display:inline-flex!important')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('span:has(button[aria-label]) button{width:28px!important;height:28px!important}')
  })

  it('keeps native actions visible for the workspace containing the selected session', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[role="tree"]>div:has([role="treeitem"][aria-selected="true"]) [role="treeitem"][aria-expanded]>span:last-child{display:inline-flex!important}')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[role="treeitem"][aria-expanded]:has(>span[class*="_folderActive"])>span:last-child{display:inline-flex!important}')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('data-workspace-id')
  })

  it('turns the feedback note label into a compact native-style edit action', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[data-turn-tail]>div:last-child>button[aria-haspopup=dialog][aria-expanded]')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('width:28px;max-width:28px;height:28px')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('mask:url("data:image/svg+xml')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('background:var(--dsw-alias-interactive-bg-hover')
  })

  it('keeps the Cordis inventory panel viewport-bound and wraps its rows on mobile', () => {
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[data-cordis-panel]')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[data-cordis-row]>div{min-width:0;flex-wrap:wrap}')
    expect(MOBILE_STOCK_LAYOUT_STYLES).toContain('[data-cordis-row] span{max-width:100%;white-space:normal;overflow-wrap:anywhere')
    expect(MOBILE_STOCK_LAYOUT_STYLES).not.toContain('[data-cordis-panel]{transform:')
  })

  it('suppresses only the automatic composer focus after switching sessions', () => {
    const guard = new MobileComposerAutofocusGuard('session-a')
    const input = new EventTarget()

    guard.selectionChanged('session-b', 1_000)
    expect(guard.shouldBlur(input, 1_100)).toBe(true)
    expect(guard.shouldBlur(input, 1_101)).toBe(false)

    guard.selectionChanged('session-c', 2_000)
    guard.pointerDown(input, 2_050)
    expect(guard.shouldBlur(input, 2_060)).toBe(false)
  })

  it('expires a pending autofocus suppression instead of affecting later input', () => {
    const guard = new MobileComposerAutofocusGuard('session-a')
    guard.selectionChanged('session-b', 1_000)
    expect(guard.shouldBlur(new EventTarget(), 2_201)).toBe(false)
  })

  it('keeps the drawer open for native session actions and closes it for row selection', () => {
    const target = (interactive: boolean, treeitem: boolean, expanded: string | null = null) => ({
      closest: (selector: string) => {
        if (selector === '[role="treeitem"]') {
          return treeitem ? { getAttribute: () => expanded } : null
        }
        return interactive ? {} : null
      },
    }) as unknown as Pick<Element, 'closest'>

    expect(shouldCloseMobileSidebarForElement(target(true, true))).toBe(false)
    expect(shouldCloseMobileSidebarForElement(target(false, true))).toBe(true)
    expect(shouldCloseMobileSidebarForElement(target(false, true, 'false'))).toBe(false)
    expect(shouldCloseMobileSidebarForElement(target(false, false))).toBe(false)
  })
})
