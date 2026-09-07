import React, { useSyncExternalStore } from 'react'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-session-log-export/client'
import { Button, IconDarkOutline16, IconLightOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext } from './client-context.js'
import { applyMobileSubagents, MOBILE_SUBAGENT_STYLES } from './mobile-subagents.js'
import { applyMobileSessionInfo, MOBILE_SESSION_INFO_STYLES } from './mobile-session-info.js'

const NS = 'dsh.localLink'
export const MOBILE_SETTINGS_PRIORITY = -100
export const MOBILE_LOCAL_ACCESS_PRIORITY = -100

interface MobileLabels {
  readonly closeOverlay: string
  readonly openNavigation: string
}

interface ThemeSnapshot {
  readonly preference: 'light' | 'dark' | 'system'
  readonly active: {
    readonly colorScheme: 'dark' | 'light'
    readonly tokens: Readonly<Record<string, string>>
  }
}

interface ThemeController {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => ThemeSnapshot
  readonly setDark: (dark: boolean) => void
}

export class MobileComposerAutofocusGuard {
  private selected: string | undefined
  private suppressUntil = 0
  private pointerTarget: EventTarget | null = null
  private pointerAt = 0

  constructor(selected: string | undefined) {
    this.selected = selected
  }

  selectionChanged(selected: string | undefined, now: number): void {
    if (selected === this.selected) return
    this.selected = selected
    this.suppressUntil = now + 1_200
  }

  pointerDown(target: EventTarget, now: number): void {
    this.pointerTarget = target
    this.pointerAt = now
  }

  shouldBlur(target: EventTarget, now: number): boolean {
    const intentional = this.pointerTarget === target && now - this.pointerAt <= 700
    this.pointerTarget = null
    if (intentional) {
      this.suppressUntil = 0
      return false
    }
    if (now > this.suppressUntil) return false
    this.suppressUntil = 0
    return true
  }
}

function installMobileComposerAutofocusGuard(ctx: ClientContext): () => void {
  const guard = new MobileComposerAutofocusGuard(ctx.sessions.list.getSnapshot().current)
  const composerInput = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof HTMLElement)) return null
    if (!target.matches('textarea,[contenteditable="true"]')) return null
    const mobileSurface = target.closest('.dllm-main') !== null
      || document.body.hasAttribute('data-dsh-local-link-mobile')
    return mobileSurface ? target : null
  }
  const offSessions = ctx.sessions.list.subscribe(() => {
    guard.selectionChanged(ctx.sessions.list.getSnapshot().current, Date.now())
  })
  const onPointerDown = (event: PointerEvent): void => {
    const target = composerInput(event.target)
    if (target !== null) guard.pointerDown(target, Date.now())
  }
  const onFocusIn = (event: FocusEvent): void => {
    const target = composerInput(event.target)
    if (target !== null && guard.shouldBlur(target, Date.now())) target.blur()
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('focusin', onFocusIn, true)
  return () => {
    offSessions()
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('focusin', onFocusIn, true)
  }
}

interface MobileThemeToggleProps {
  readonly controller: ThemeController
  readonly useDarkLabel: string
  readonly useLightLabel: string
}

interface StockMobileControlsProps {
  readonly layout: ILayout
  readonly labels: MobileLabels
  readonly themeController: ThemeController
  readonly useDarkLabel: string
  readonly useLightLabel: string
}

const MOBILE_SIDEBAR_INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="menuitem"]',
].join(',')

/**
 * Close the drawer only for a row-selection tap. Harness owns the session
 * overflow button and renders its Menu through a portal; treating that button
 * as a row tap closes the drawer before Rename/Fork/Archive can be selected.
 */
export function shouldCloseMobileSidebarForElement(target: Pick<Element, 'closest'>): boolean {
  if (target.closest(MOBILE_SIDEBAR_INTERACTIVE_SELECTOR) !== null) return false
  const item = target.closest('[role="treeitem"]')
  return item !== null && item.getAttribute('aria-expanded') === null
}


export function MobileThemeToggle({ controller, useDarkLabel, useLightLabel }: MobileThemeToggleProps): React.JSX.Element {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const dark = snapshot.active.colorScheme === 'dark'
  const label = dark ? useLightLabel : useDarkLabel
  return <Button
    aria-label={label}
    className="dllm-theme-button"
    title={label}
    size="sm"
    variant="ghost"
    onClick={() => controller.setDark(!dark)}
  >{dark
      ? <IconDarkOutline16 size={16} />
      : <IconLightOutline16 size={16} />}
  </Button>
}

function StockMobileControls({ layout, labels, themeController, useDarkLabel, useLightLabel }: StockMobileControlsProps): React.JSX.Element {
  return <div className="dllm-stock-controls">
    <Button
      aria-label={labels.openNavigation}
      className="dllm-stock-menu"
      size="sm"
      variant="toolbar"
      onClick={() => layout.toggleSidebar()}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    </Button>
    <Button
      aria-label={labels.closeOverlay}
      className="dllm-stock-scrim"
      size="sm"
      variant="ghost"
      onClick={() => layout.toggleSidebar()}
    />
    <div className="dllm-stock-theme">
      <MobileThemeToggle controller={themeController} useDarkLabel={useDarkLabel} useLightLabel={useLightLabel} />
    </div>
  </div>
}

export const MOBILE_STOCK_LAYOUT_STYLES = `
body[data-dsh-local-link-mobile]{overflow:hidden}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay]){--dllm-side-drawer-width:min(88vw,340px);--dllm-side-drawer-closed-transform:translateX(calc(-1 * var(--dllm-side-drawer-width) - 14px));grid-template-columns:minmax(0,1fr)!important}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay])>:first-child{position:fixed;z-index:70;inset:0 auto 0 0;box-sizing:border-box;width:var(--dllm-side-drawer-width);transform:translateX(0);transition:transform 190ms cubic-bezier(.22,1,.36,1);box-shadow:18px 0 46px rgb(15 23 42 / 18%)}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay])>:first-child>[data-slot="sidebar"]>*{width:100%!important;height:100%!important}
body[data-dsh-local-link-mobile] [data-slot="sidebar"] button[class*="_brand"]{flex:0 0 auto!important;inline-size:max-content!important;width:max-content!important;min-width:0!important;max-width:calc(100% - 72px)!important;margin-right:auto!important}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div[data-sidebar-collapsed]:has(>[data-shell-overlay])>:first-child{transform:var(--dllm-side-drawer-closed-transform);pointer-events:none}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay])>:nth-child(2){grid-column:1;grid-row:1;min-width:0}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay])>:nth-child(3){display:none}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay])>[data-shell-overlay]{z-index:90}
.dllm-stock-controls{position:absolute;inset:0;pointer-events:none}
.dllm-stock-menu{position:absolute;top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));display:grid;width:44px;height:44px;padding:0;place-items:center;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(148 163 184 / 30%));border-radius:12px;color:inherit;background:var(--dsw-alias-bg-layer-1,rgb(255 255 255 / 92%));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgb(15 23 42 / 14%));pointer-events:auto;transition:opacity 120ms ease,transform 120ms ease}
.dllm-stock-menu svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:not([data-sidebar-collapsed]):has(>[data-shell-overlay]) .dllm-stock-menu{opacity:0;transform:scale(.9);pointer-events:none}
.dllm-stock-scrim{position:absolute;inset:0 0 0 var(--dllm-side-drawer-width);width:auto;height:auto;min-height:0;padding:0;border:0;border-radius:0;background:var(--dsw-alias-bg-mask-1,rgb(15 23 42 / 40%))!important;pointer-events:auto}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div[data-sidebar-collapsed]:has(>[data-shell-overlay]) .dllm-stock-scrim{opacity:0;pointer-events:none}
.dllm-stock-theme{position:absolute;top:calc(env(safe-area-inset-top) + 22px);left:calc(var(--dllm-side-drawer-width) - 76px);display:grid;width:28px;height:28px;place-items:center;opacity:1;visibility:visible;transform:translateX(0);pointer-events:auto;transition:opacity 120ms ease,transform 190ms cubic-bezier(.22,1,.36,1),visibility 0s linear 0s}
.dllm-stock-theme .dllm-theme-button{box-sizing:border-box!important;width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;padding:0!important;border-radius:50%!important}
body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div[data-sidebar-collapsed]:has(>[data-shell-overlay]) .dllm-stock-theme{opacity:0;visibility:hidden;transform:var(--dllm-side-drawer-closed-transform);pointer-events:none;transition:opacity 120ms ease,transform 190ms cubic-bezier(.22,1,.36,1),visibility 0s linear 190ms}
body[data-dsh-local-link-mobile] [data-slot="sidebar.workspaces"] button[aria-label="Add workspace"],body[data-dsh-local-link-mobile] [data-slot="sidebar.workspaces"] button[aria-label="添加工作区"]{display:none!important}
body[data-dsh-local-link-mobile] [role="treeitem"][aria-selected="true"]>span:has(button[aria-label]){display:inline-flex!important;margin-left:4px}
body[data-dsh-local-link-mobile] [role="treeitem"][aria-selected="true"]>span:has(button[aria-label]) button{width:28px!important;height:28px!important}
body[data-dsh-local-link-mobile] [role="tree"]>div:has([role="treeitem"][aria-selected="true"]) [role="treeitem"][aria-expanded]>span:last-child{display:inline-flex!important}
body[data-dsh-local-link-mobile] [role="treeitem"][aria-expanded]:has(>span[class*="_folderActive"])>span:last-child{display:inline-flex!important}
body[data-dsh-local-link-mobile] header{min-width:0;padding-left:max(58px,env(safe-area-inset-left));padding-right:max(10px,env(safe-area-inset-right))}
body[data-dsh-local-link-mobile] textarea,body[data-dsh-local-link-mobile] input{font-size:max(16px,1em)}
body[data-dsh-local-link-mobile] [role=tablist]{display:flex;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
body[data-dsh-local-link-mobile] [role=tablist]::-webkit-scrollbar{display:none}body[data-dsh-local-link-mobile] [role=tab]{flex:0 0 auto;min-height:40px;touch-action:manipulation}
body[data-dsh-local-link-mobile] header nav:has(.dllm-lineage-title){gap:0!important;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
body[data-dsh-local-link-mobile] header nav:has(.dllm-lineage-title)>span{gap:1px!important}
body[data-dsh-local-link-mobile] header nav:has(.dllm-lineage-title)>span>button{padding-inline:4px!important;font-size:14px!important;line-height:20px!important}
body[data-dsh-local-link-mobile] [data-turn-tail]>div:last-child>button[aria-haspopup=dialog][aria-expanded]{position:relative;box-sizing:border-box;width:28px;max-width:28px;height:28px;overflow:hidden;padding:6px;border:0;border-radius:50%;color:var(--dsw-alias-label-secondary,inherit);font-size:0;line-height:0;text-indent:-9999px;background:var(--dsw-alias-interactive-bg-hover,rgb(127 127 127 / 14%))}
body[data-dsh-local-link-mobile] [data-turn-tail]>div:last-child>button[aria-haspopup=dialog][aria-expanded]::before{content:"";display:block;width:16px;height:16px;background:currentColor;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.8 2.4a1.7 1.7 0 0 1 2.4 2.4L6 12l-3 .6.6-3 7.2-7.2Z'/%3E%3Cpath d='m9.8 3.4 2.8 2.8'/%3E%3C/svg%3E") center/16px 16px no-repeat}
body[data-dsh-local-link-mobile] [data-cordis-panel]{left:max(12px,env(safe-area-inset-left))!important;right:max(12px,env(safe-area-inset-right))!important;bottom:max(12px,env(safe-area-inset-bottom))!important;width:auto!important;max-width:none!important;max-height:calc(100dvh - max(24px,env(safe-area-inset-top) + env(safe-area-inset-bottom)))!important}
body[data-dsh-local-link-mobile] [data-cordis-row]{min-width:0}body[data-dsh-local-link-mobile] [data-cordis-row]>div{min-width:0;flex-wrap:wrap}body[data-dsh-local-link-mobile] [data-cordis-row] span{max-width:100%;white-space:normal;overflow-wrap:anywhere;text-overflow:clip}
@media(prefers-reduced-motion:reduce){body[data-dsh-local-link-mobile] #root>[data-slot="root"]>div:has(>[data-shell-overlay])>:first-child,.dllm-stock-theme{transition:none!important}}
${MOBILE_SUBAGENT_STYLES}
${MOBILE_SESSION_INFO_STYLES}
`

/**
 * Enhance Harness' shipped responsive AppFrame without claiming its root or
 * redeclaring its child slots. This is the 3080 path used by the normal client.
 */
function applyResponsiveMobileEnhancementsBody(ctx: ClientContext): void {
  const themeController: ThemeController = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: listener => ctx.on('theme/change', () => listener()),
    setDark: dark => ctx.theme.setTheme(dark ? 'dark' : 'light'),
  }
  const t = ctx.locale.bind(NS)
  const labels: MobileLabels = {
    closeOverlay: t('mobile.closeOverlay'),
    openNavigation: t('mobile.openNavigation'),
  }

  applyMobileSubagents(ctx)
  applyMobileSessionInfo(ctx)

  ctx.effect(() => {
    document.body.dataset.dshLocalLinkMobile = ''
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-local-link-mobile-enhancements'
    style.textContent = MOBILE_STOCK_LAYOUT_STYLES
    document.head.append(style)
    return () => {
      delete document.body.dataset.dshLocalLinkMobile
      style.remove()
    }
  }, 'dsh-local-link: stock mobile layout styles')

  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-local-link-mobile-controls',
    order: -100,
  }, () => <StockMobileControls
    layout={ctx.layout}
    labels={labels}
    themeController={themeController}
    useDarkLabel={t('mobile.useDarkMode')}
    useLightLabel={t('mobile.useLightMode')}
  />)), 'dsh-local-link: stock mobile controls')

  ctx.effect(() => installMobileComposerAutofocusGuard(ctx),
  'dsh-local-link: suppress mobile composer autofocus on session change')

  ctx.effect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element) || !shouldCloseMobileSidebarForElement(target)) return
      const frame = document.querySelector('[data-shell-overlay]')?.parentElement
      if (frame?.hasAttribute('data-sidebar-collapsed') !== false) return
      window.setTimeout(() => ctx.layout.toggleSidebar(), 0)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, 'dsh-local-link: close stock mobile sidebar after session selection')

  ctx.effect(() => ctx.slots.inject('sidebar.settings', () => ctx.slots.register({
    name: 'sidebar.settings',
    priority: MOBILE_SETTINGS_PRIORITY,
  }, () => null)), 'dsh-local-link: hide desktop settings entry on mobile')

  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'local-link-connect',
    priority: MOBILE_LOCAL_ACCESS_PRIORITY,
  }, () => null)), 'dsh-local-link: hide nested local access action on mobile')
}

export const applyResponsiveMobileEnhancements = Object.assign(applyResponsiveMobileEnhancementsBody, {
  inject: ['slots', 'theme', 'locale', 'sessions', 'sessionLogDownload', 'layout'],
})
