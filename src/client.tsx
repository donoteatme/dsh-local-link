import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { Button, IconChevronDownOutline14, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext } from './client-context.js'
import { applyResponsiveMobileEnhancements } from './mobile-layout.js'
import en from './locales/en.json' with { type: 'json' }
import zh from './locales/zh.json' with { type: 'json' }

const NS = 'dsh.localLink'
type LocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh.localLink': LocaleKey
  }
}

interface Device {
  id: string
  name: string
  deviceType: string
  browser: string
}

interface DevicePayload {
  id?: unknown
  name?: unknown
  deviceType?: unknown
  browser?: unknown
  label?: unknown
}

interface StatusPayload {
  devices?: unknown
}

interface Status {
  devices: Device[]
}

interface DiagnosticEvent {
  id: string
  at: string
  level: 'warn' | 'error'
  code: string
  context?: Record<string, string | number | boolean>
}

interface DiagnosticsPayload {
  events?: unknown
}

interface Pairing {
  id: string
  url: string
  qrDataUrl: string
  expiresAt: string
}

interface PairingState {
  status: 'active' | 'consumed' | 'expired' | 'unknown'
}

interface PopoverPosition {
  left: number
  top: number
}

type FooterProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS>
type LocalLinkFooterProps = FooterProps & { readonly getCurrentSessionId: () => string | undefined }

function desktopOrigin(): boolean {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1'
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1_000))
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function payloadText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

function legacyDeviceType(label: unknown): string {
  if (typeof label !== 'string') return 'Computer'
  if (/ipad|tablet/iu.test(label)) return 'Tablet'
  if (/iphone|android|mobile|phone|linux\s+arm/iu.test(label)) return 'Phone'
  return 'Computer'
}

function normalizeDevices(payload: StatusPayload): Device[] {
  if (!Array.isArray(payload.devices)) return []
  return payload.devices.flatMap(value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
    const device = value as DevicePayload
    if (typeof device.id !== 'string') return []
    return [{
      id: device.id,
      name: payloadText(device.name, 'My device'),
      deviceType: payloadText(device.deviceType, legacyDeviceType(device.label)),
      browser: payloadText(device.browser, 'Browser'),
    }]
  })
}

function normalizeDiagnostics(payload: DiagnosticsPayload): DiagnosticEvent[] {
  if (!Array.isArray(payload.events)) return []
  return payload.events.flatMap(value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
    const event = value as Partial<DiagnosticEvent>
    if (typeof event.id !== 'string' || typeof event.at !== 'string' || typeof event.code !== 'string'
      || (event.level !== 'warn' && event.level !== 'error')) return []
    const context = event.context !== null && typeof event.context === 'object' && !Array.isArray(event.context)
      ? Object.fromEntries(Object.entries(event.context).filter((entry): entry is [string, string | number | boolean] => {
          const item = entry[1]
          return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
        }))
      : undefined
    return [{ id: event.id, at: event.at, level: event.level, code: event.code, ...(context === undefined ? {} : { context }) }]
  })
}

function openSettingsSection(label: string): void {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"][aria-expanded]')
  if (trigger === null) return
  trigger.click()
  let attempts = 0
  const selectSection = (): void => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    const target = dialog === null ? undefined : [...dialog.querySelectorAll<HTMLButtonElement>('nav button')]
      .find(button => button.textContent?.trim() === label)
    if (target !== undefined) {
      target.click()
      return
    }
    attempts += 1
    if (attempts < 10) window.requestAnimationFrame(selectSection)
  }
  window.requestAnimationFrame(selectSection)
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

function reportActionError(code: 'CLIPBOARD_COPY_FAILED' | 'DEVICE_REVOKE_FAILED' | 'DEVICE_RENAME_FAILED'): void {
  void fetch('/__dsh-local-link/admin/diagnostics/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => undefined)
}

const styles = `
:root{--dsh-local-link-border-width:.5px}
.dsh-local-link{box-sizing:border-box;width:100%;max-width:760px;padding:4px 4px 32px;color:var(--dsw-alias-label-primary,#16181d)}
.dsh-local-link h2{margin:0 0 5px;font-size:20px}.dsh-local-link>p{margin:0;color:var(--dsw-alias-label-secondary,#66707c);line-height:1.5}
.dsh-local-link__devices{display:grid;margin-top:12px;border-block:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-subtle,#dce1e8))}.dsh-local-link__devices>p{margin:0;padding:12px 0;color:var(--dsw-alias-label-secondary,#66707c);line-height:1.45}.dsh-local-link__device{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px 0;border-top:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-subtle,#dce1e8))}.dsh-local-link__device:first-child{border-top:0}.dsh-local-link__device-info{display:grid;min-width:0;gap:2px}.dsh-local-link__device-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 14px/1.25 system-ui}.dsh-local-link__device-info small{overflow:hidden;color:var(--dsw-alias-label-secondary,#66707c);font:12px/1.3 system-ui;text-overflow:ellipsis;white-space:nowrap}.dsh-local-link__device-actions{display:flex;gap:6px}.dsh-local-link__device-editor{display:grid;grid-column:1/-1;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:6px}.dsh-local-link__device-name-input{min-width:0;width:100%}@media(max-width:440px){.dsh-local-link__device{grid-template-columns:minmax(0,1fr) auto;gap:8px}.dsh-local-link__device-actions{gap:4px}.dsh-local-link__device-editor{grid-template-columns:1fr auto}.dsh-local-link__device-name-input{grid-column:1/-1}}
.dsh-local-link__diagnostics{margin-top:30px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#45484d);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#303236);transition:border-color .16s,background .16s}.dsh-local-link__diagnostics:hover{border-color:var(--dsw-alias-label-dimmed,#74777d)}.dsh-local-link__diagnostics[open]{border-color:var(--dsw-alias-border-l2,#45484d);background:var(--dsw-alias-bg-layer-2,#282a2e)}.dsh-local-link__diagnostics summary{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:14px 16px;box-sizing:border-box;cursor:pointer;list-style:none}.dsh-local-link__diagnostics summary::-webkit-details-marker{display:none}.dsh-local-link__diagnostics summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2878ff);outline-offset:-2px}.dsh-local-link__diagnostics-summary-main,.dsh-local-link__diagnostics-summary-meta{display:flex;align-items:center;min-width:0}.dsh-local-link__diagnostics-summary-main{flex:1;gap:11px}.dsh-local-link__diagnostics-summary-meta{flex:none;gap:12px}.dsh-local-link__diagnostics-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2878ff) 14%,transparent);color:var(--dsw-alias-brand-primary,#2878ff)}.dsh-local-link__diagnostics-copy{display:flex;flex:1;flex-direction:column;min-width:0;gap:4px}.dsh-local-link__diagnostics-copy strong{color:var(--dsw-alias-label-primary,#f2f3f5);font:600 15px/1.4 system-ui}.dsh-local-link__diagnostics-copy small{overflow:hidden;color:var(--dsw-alias-label-tertiary,#a6a8ad);font:13px/1.5 system-ui;text-overflow:ellipsis;white-space:nowrap}.dsh-local-link__diagnostics-badge{padding:0;color:var(--dsw-alias-label-tertiary,#a6a8ad);font:400 12px/1.3 system-ui;white-space:nowrap}.dsh-local-link__diagnostics-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#a6a8ad);transition:transform .16s}.dsh-local-link__diagnostics[open] .dsh-local-link__diagnostics-chevron{transform:rotate(180deg)}.dsh-local-link__diagnostics-body{margin:0 16px;padding:12px 0 8px;border-top:1px solid var(--dsw-alias-border-l2,#45484d)}.dsh-local-link__diagnostics-body>p{margin:0 0 12px;color:var(--dsw-alias-label-tertiary,#a6a8ad);font:12px/1.5 system-ui}.dsh-local-link__diagnostics-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.dsh-local-link__diagnostic-list{display:grid;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#45484d);border-radius:9px;background:var(--dsw-alias-bg-layer-3,#303236)}.dsh-local-link__diagnostic{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:baseline;gap:8px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l2,#45484d);font:12px/1.35 system-ui}.dsh-local-link__diagnostic:first-child{border-top:0}.dsh-local-link__diagnostic-level{width:7px;height:7px;border-radius:50%;background:#6b7280}.dsh-local-link__diagnostic-level--warn{background:#d28b15}.dsh-local-link__diagnostic-level--error{background:#dc4c4c}.dsh-local-link__diagnostic code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 11px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace}.dsh-local-link__diagnostic time{color:var(--dsw-alias-label-tertiary,#a6a8ad);font-size:11px;white-space:nowrap}.dsh-local-link__diagnostic-context{grid-column:2/-1;overflow:hidden;color:var(--dsw-alias-label-tertiary,#a6a8ad);font:11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}@media(max-width:540px){.dsh-local-link__diagnostics-copy small{display:none}.dsh-local-link__diagnostics summary{padding-inline:12px}.dsh-local-link__diagnostics-badge{max-width:92px;overflow:hidden;text-overflow:ellipsis}}
.dsh-local-link__diagnostics,.dsh-local-link__diagnostic-list{border-width:var(--dsh-local-link-border-width)}.dsh-local-link__diagnostics-body,.dsh-local-link__diagnostic{border-top-width:var(--dsh-local-link-border-width)}
.dsh-local-link__diagnostics:hover{border-color:var(--dsw-alias-border-l2,#45484d);background:var(--dsw-alias-bg-layer-2,#282a2e)}
.dsh-local-link-footer{position:relative;width:100%;min-width:0}:where(div):has(> .dsh-local-link-footer),:where(div):has(> :where(div) > .dsh-local-link-footer){flex-direction:column;gap:4px}:where(div):has(> .dsh-local-link-footer)>.dsh-local-link-footer+:where(div){margin-block-start:0!important}.dsh-local-link-trigger{box-sizing:border-box;display:flex;align-items:center;justify-content:flex-start;gap:8px;width:calc(100% + 4px);height:42px;margin:0 -2px;padding:0 10px 0 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary,#16181d);font:400 14px/22px inherit;cursor:pointer;overflow:hidden}.dsh-local-link-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,#e8ebef)}.dsh-local-link-trigger--rail{justify-content:center;gap:0;width:36px;height:36px;margin:0;padding:0;border-radius:50%}.dsh-local-link-trigger__label{white-space:nowrap;overflow:hidden}
.dsh-local-link-popover{position:fixed;z-index:10000;box-sizing:border-box;width:min(360px,calc(100vw - 24px));height:auto;max-height:calc(100vh - 24px);padding:16px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-subtle,#dce1e8));border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#16181d);box-shadow:0 18px 55px #0004}.dsh-local-link-popover__header{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsh-local-link-popover strong{font-size:15px}.dsh-local-link-popover__manage{flex:none;color:var(--dsw-alias-label-secondary,#66707c)}.dsh-local-link-popover p{margin:8px 0;color:var(--dsw-alias-label-secondary,#66707c);font:13px/1.45 system-ui}.dsh-local-link-popover__content{min-height:336px}.dsh-local-link-popover__qr,.dsh-local-link-popover__qr-placeholder{box-sizing:content-box;display:block;width:200px;height:200px;margin:12px auto 0;padding:7px;border-radius:12px}.dsh-local-link-popover__qr{background:#fff;transition:opacity .2s,filter .2s}.dsh-local-link-popover__qr-placeholder{background:var(--dsw-alias-bg-layer-2,#eef1f5)}.dsh-local-link-popover__loading{text-align:center}.dsh-local-link-popover__qr--expired{opacity:.3;filter:grayscale(1)}.dsh-local-link-popover__link{display:flex;align-items:stretch;min-width:0;height:40px;margin-top:12px;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-normal,#cbd2dc));border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#eef1f5)}.dsh-local-link-popover__link-value{position:relative;display:flex;align-items:center;flex:1;min-width:0;padding:0 8px 0 10px;overflow:hidden;white-space:nowrap;font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;mask-image:linear-gradient(to right,#000 76%,transparent 98%);-webkit-mask-image:linear-gradient(to right,#000 76%,transparent 98%)}.dsh-local-link-popover__copy{min-width:76px;padding:0 11px;border:0;border-left:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,var(--dsw-alias-border-normal,#cbd2dc));border-radius:0;transition:background .18s,color .18s}.dsh-local-link-popover__copy--copied{background:#16803a22;color:#39a85b}.dsh-local-link-popover__meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;color:var(--dsw-alias-label-secondary,#66707c);font:11px/1.35 system-ui}.dsh-local-link-popover__regenerate{display:flex;width:100%;margin-top:10px}.dsh-local-link-popover__error{color:#c53030!important}
.dsh-local-link__diagnostic-level{background:var(--dsw-alias-label-tertiary,#6b7280)}
.dsh-local-link__diagnostic-level--warn{background:var(--dsw-alias-state-warn-primary,#d28b15)}
.dsh-local-link__diagnostic-level--error{background:var(--dsw-alias-state-error-primary,#dc4c4c)}
.dsh-local-link-popover{box-shadow:var(--dsw-shadow-lv3,0 18px 55px #0004)}
.dsh-local-link-popover__content{min-height:350px}
.dsh-local-link-popover__qr{background:var(--dsw-static-neutral-00,#fff)}
.dsh-local-link-popover__copy--copied{background:var(--dsw-alias-state-success-tertiary,#16803a22);color:var(--dsw-alias-state-success-primary,#39a85b)}
.dsh-local-link-popover__error{color:var(--dsw-alias-state-error-primary,#c53030)!important}
`

function LocalLinkFooter({ wide, t, getCurrentSessionId }: LocalLinkFooterProps): React.JSX.Element | null {
  const desktop = desktopOrigin()
  const root = useRef<HTMLDivElement>(null)
  const popover = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>()
  const [pairing, setPairing] = useState<Pairing>()
  const [remaining, setRemaining] = useState(0)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [error, setError] = useState(false)
  const copyReset = useRef<number | undefined>(undefined)

  const createLink = useCallback(async () => {
    setPairing(undefined)
    setRemaining(0)
    setCopyState('idle')
    setError(false)
    try {
      const nextPairing = await jsonRequest<Pairing>('/__dsh-local-link/admin/pairing', {
        method: 'POST',
        body: JSON.stringify({ sessionId: getCurrentSessionId() }),
      })
      setPairing(nextPairing)
      setRemaining(secondsUntil(nextPairing.expiresAt))
    } catch { setError(true) }
  }, [getCurrentSessionId])

  const copyLink = useCallback(async () => {
    if (pairing === undefined || remaining === 0) return
    try {
      await navigator.clipboard.writeText(pairing.url)
      setCopyState('copied')
      if (copyReset.current !== undefined) window.clearTimeout(copyReset.current)
      copyReset.current = window.setTimeout(() => setCopyState('idle'), 1_800)
    } catch {
      setCopyState('error')
      reportActionError('CLIPBOARD_COPY_FAILED')
    }
  }, [pairing, remaining])

  useEffect(() => {
    if (!open || pairing === undefined) return
    let disposed = false
    const update = (): void => setRemaining(secondsUntil(pairing.expiresAt))
    const check = async (): Promise<void> => {
      try {
        const result = await jsonRequest<PairingState>(`/__dsh-local-link/admin/pairing/status?id=${encodeURIComponent(pairing.id)}`)
        if (!disposed && result.status === 'consumed') setOpen(false)
      } catch { /* A transient status failure must not replace a still-visible invitation. */ }
    }
    update()
    void check()
    const countdownTimer = window.setInterval(update, 1_000)
    const statusTimer = window.setInterval(() => void check(), 2_000)
    return () => {
      disposed = true
      window.clearInterval(countdownTimer)
      window.clearInterval(statusTimer)
    }
  }, [open, pairing])

  useEffect(() => () => {
    if (copyReset.current !== undefined) window.clearTimeout(copyReset.current)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setPopoverPosition(undefined)
      return
    }
    const position = (): void => {
      const anchorRect = root.current?.getBoundingClientRect()
      const popoverRect = popover.current?.getBoundingClientRect()
      if (anchorRect === undefined || popoverRect === undefined) return
      const viewportGutter = 12
      const preferredLeft = anchorRect.right + 20
      const left = preferredLeft + popoverRect.width <= window.innerWidth - viewportGutter
        ? preferredLeft
        : Math.max(viewportGutter, window.innerWidth - popoverRect.width - viewportGutter)
      const top = Math.max(viewportGutter, Math.round((window.innerHeight - popoverRect.height) / 2))
      setPopoverPosition({ left: Math.round(left), top })
    }
    const frame = window.requestAnimationFrame(position)
    const observer = new ResizeObserver(position)
    if (popover.current !== null) observer.observe(popover.current)
    window.addEventListener('resize', position)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', position)
    }
  }, [open])

  if (!desktop) return null
  return <div className="dsh-local-link-footer" ref={root}>
    <Button className={`dsh-local-link-trigger${wide ? '' : ' dsh-local-link-trigger--rail'}`} size="md" variant="ghost" title={t('footer.trigger')} aria-label={t('footer.trigger')} aria-expanded={open} onClick={() => {
      const next = !open
      setOpen(next)
      if (next) void createLink()
    }}>
      <svg aria-hidden="true" width={wide ? 16 : 18} height={wide ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M9 5.5h6M11 18.5h2"/></svg>
      {wide && <span className="dsh-local-link-trigger__label">{t('footer.trigger')}</span>}
    </Button>
    {open && <section className="dsh-local-link-popover" ref={popover} style={popoverPosition ?? { visibility: 'hidden' }} aria-label={t('connect.title')}>
      <div className="dsh-local-link-popover__header">
        <strong>{t('connect.title')}</strong>
        <Button className="dsh-local-link-popover__manage" size="sm" variant="ghost" onClick={() => { setOpen(false); openSettingsSection(t('nav')) }}>{t('connect.pairedDevices')}</Button>
      </div>
      <p>{t('connect.description')}</p>
      <div className="dsh-local-link-popover__content" aria-busy={pairing === undefined && !error} aria-live="polite">
      {!pairing && !error && <>
        <div aria-hidden="true" className="dsh-local-link-popover__qr-placeholder" />
        <p className="dsh-local-link-popover__loading">{t('connect.creating')}</p>
      </>}
      {error && <p className="dsh-local-link-popover__error">{t('connect.error')}</p>}
      {pairing && <>
        <img className={`dsh-local-link-popover__qr${remaining === 0 ? ' dsh-local-link-popover__qr--expired' : ''}`} src={pairing.qrDataUrl} alt={t('connect.qrAlt')} />
        <div className="dsh-local-link-popover__link" aria-label={t('connect.linkLabel')}>
          <code className="dsh-local-link-popover__link-value" title={pairing.url}>{pairing.url}</code>
          <Button className={`dsh-local-link-popover__copy${copyState === 'copied' ? ' dsh-local-link-popover__copy--copied' : ''}`} disabled={remaining === 0} size="md" variant="ghost" onClick={() => void copyLink()}>{copyState === 'copied' ? t('connect.copied') : t('connect.copy')}</Button>
        </div>
        {copyState === 'error' && <p className="dsh-local-link-popover__error">{t('connect.copyError')}</p>}
        <div className="dsh-local-link-popover__meta">
          <span>{t('connect.oneDevice')}</span>
          <span>{remaining === 0 ? t('connect.expired') : `${t('connect.expiresIn')} ${formatCountdown(remaining)}`}</span>
        </div>
        <Button className="dsh-local-link-popover__regenerate" size="md" variant="outline" onClick={() => void createLink()}>{t('connect.regenerate')}</Button>
      </>}
      </div>
    </section>}
  </div>
}

function LocalLinkSettings({ t }: PropsLocale<typeof NS>): React.JSX.Element {
  const [status, setStatus] = useState<Status>()
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>()
  const [busyId, setBusyId] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState(false)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [reportState, setReportState] = useState<'idle' | 'copied' | 'error'>('idle')

  const loadDevices = useCallback(async () => {
    try {
      const payload = await jsonRequest<StatusPayload>('/__dsh-local-link/admin/devices')
      setStatus({ devices: normalizeDevices(payload) })
      setError(false)
    } catch { setError(true) }
  }, [])

  const loadDiagnostics = useCallback(async () => {
    try {
      const payload = await jsonRequest<DiagnosticsPayload>('/__dsh-local-link/admin/diagnostics')
      setDiagnostics(normalizeDiagnostics(payload))
      setDiagnosticsError(false)
    } catch { setDiagnosticsError(true) }
  }, [])

  useEffect(() => { void loadDevices(); void loadDiagnostics() }, [loadDevices, loadDiagnostics])

  const revoke = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await jsonRequest('/__dsh-local-link/admin/revoke', { method: 'POST', body: JSON.stringify({ id }) })
      await loadDevices()
    } catch {
      setError(true)
      reportActionError('DEVICE_REVOKE_FAILED')
    }
    finally { setBusyId(undefined) }
  }

  const rename = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await jsonRequest('/__dsh-local-link/admin/rename', { method: 'POST', body: JSON.stringify({ id, name: draftName }) })
      setEditingId(undefined)
      await loadDevices()
    } catch {
      setError(true)
      reportActionError('DEVICE_RENAME_FAILED')
    }
    finally { setBusyId(undefined) }
  }

  const copyDiagnostics = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        events: diagnostics ?? [],
      }, null, 2))
      setReportState('copied')
    } catch { setReportState('error') }
  }

  const clearDiagnostics = async (): Promise<void> => {
    if (!window.confirm(t('diagnostics.clearConfirm'))) return
    setDiagnosticsBusy(true)
    try {
      await jsonRequest('/__dsh-local-link/admin/diagnostics/clear', { method: 'POST', body: '{}' })
      setDiagnostics([])
      setDiagnosticsError(false)
      setReportState('idle')
    } catch { setDiagnosticsError(true) }
    finally { setDiagnosticsBusy(false) }
  }

  return <section className="dsh-local-link">
    <h2>{t('devices.title')}</h2>
    <p>{t('devices.description')}</p>
    <div className="dsh-local-link__devices" role="list">
      {error ? <p>{t('devices.error')}</p> : status === undefined ? <p>{t('devices.loading')}</p> : status.devices.length ? status.devices.map(device => <div className="dsh-local-link__device" key={device.id} role="listitem">
          {editingId === device.id ? <div className="dsh-local-link__device-editor">
            <Input autoFocus aria-label={t('devices.nameLabel')} className="dsh-local-link__device-name-input" maxLength={64} value={draftName} onChange={event => setDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void rename(device.id); if (event.key === 'Escape') setEditingId(undefined) }} />
            <Button disabled={busyId !== undefined} size="sm" variant="primary" onClick={() => void rename(device.id)}>{busyId === device.id ? t('devices.saving') : t('devices.save')}</Button>
            <Button disabled={busyId !== undefined} size="sm" variant="ghost" onClick={() => setEditingId(undefined)}>{t('devices.cancel')}</Button>
          </div> : <>
            <div className="dsh-local-link__device-info"><strong>{device.name}</strong><small>{device.deviceType} · {device.browser}</small></div>
            <div className="dsh-local-link__device-actions">
              <Button disabled={busyId !== undefined} size="sm" variant="outline" onClick={() => { setEditingId(device.id); setDraftName(device.name) }}>{t('devices.rename')}</Button>
              <Button disabled={busyId !== undefined} size="sm" variant="outline" onClick={() => void revoke(device.id)}>{busyId === device.id ? t('devices.revoking') : t('devices.revoke')}</Button>
            </div>
          </>}
      </div>) : <p>{t('devices.empty')}</p>}
    </div>
    <details className="dsh-local-link__diagnostics">
      <summary>
        <span className="dsh-local-link__diagnostics-summary-main">
          <span className="dsh-local-link__diagnostics-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.2-6 4.2 12 2.1-6H21"/></svg>
          </span>
          <span className="dsh-local-link__diagnostics-copy">
            <strong>{t('diagnostics.title')}</strong>
            <small>{t('diagnostics.subtitle')}</small>
          </span>
        </span>
        <span className="dsh-local-link__diagnostics-summary-meta">
          <span className="dsh-local-link__diagnostics-badge">{diagnosticsError ? t('diagnostics.unavailable') : diagnostics === undefined ? t('diagnostics.loading') : `${diagnostics.length} ${t('diagnostics.events')}`}</span>
          <IconChevronDownOutline14 className="dsh-local-link__diagnostics-chevron" size={14} />
        </span>
      </summary>
      <div className="dsh-local-link__diagnostics-body">
        <p>{t('diagnostics.description')}</p>
        <div className="dsh-local-link__diagnostics-actions">
          <Button disabled={diagnosticsBusy} size="sm" variant="outline" onClick={() => void loadDiagnostics()}>{t('diagnostics.refresh')}</Button>
          <Button disabled={diagnosticsBusy || diagnostics === undefined} size="sm" variant="outline" onClick={() => void copyDiagnostics()}>{reportState === 'copied' ? t('diagnostics.copied') : t('diagnostics.copy')}</Button>
          <Button disabled={diagnosticsBusy || diagnostics === undefined || diagnostics.length === 0} size="sm" variant="outline" onClick={() => void clearDiagnostics()}>{diagnosticsBusy ? t('diagnostics.clearing') : t('diagnostics.clear')}</Button>
        </div>
        {reportState === 'error' && <p>{t('diagnostics.copyError')}</p>}
        {diagnosticsError ? <p>{t('diagnostics.error')}</p> : diagnostics === undefined ? <p>{t('diagnostics.loading')}</p> : diagnostics.length === 0 ? <p>{t('diagnostics.empty')}</p> : <div className="dsh-local-link__diagnostic-list" role="list">
          {diagnostics.slice(0, 12).map(event => <div className="dsh-local-link__diagnostic" key={event.id} role="listitem">
            <span className={`dsh-local-link__diagnostic-level dsh-local-link__diagnostic-level--${event.level}`} title={event.level} />
            <code>{event.code}</code>
            <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
            {event.context !== undefined && <span className="dsh-local-link__diagnostic-context" title={JSON.stringify(event.context)}>{Object.entries(event.context).map(([key, value]) => `${key}=${String(value)}`).join(' · ')}</span>}
          </div>)}
        </div>}
      </div>
    </details>
  </section>
}

export const MOBILE_VIEW_MEDIA_QUERY = '(max-width: 834px)'

interface DisposableFiber {
  dispose: () => void | Promise<void>
}

/**
 * Mount the mobile root in its own Cordis fiber while the viewport is narrow.
 * Disposing that fiber retracts every mobile slot contribution atomically and
 * lets Harness' shipped root win again on wider screens.
 */
export function installResponsiveMobileLayout(
  media: MediaQueryList,
  mount: () => DisposableFiber,
): () => void {
  let fiber: DisposableFiber | undefined
  let disposed = false
  let reconciling = false
  let requested = media.matches

  const reconcile = async (): Promise<void> => {
    if (reconciling || disposed) return
    reconciling = true
    try {
      while (!disposed) {
        if (requested && fiber === undefined) {
          fiber = mount()
          continue
        }
        if (!requested && fiber !== undefined) {
          const mounted = fiber
          fiber = undefined
          await mounted.dispose()
          continue
        }
        break
      }
    } finally {
      reconciling = false
    }
  }

  const onChange = (event: MediaQueryListEvent): void => {
    requested = event.matches
    void reconcile()
  }
  media.addEventListener('change', onChange)
  void reconcile()

  return () => {
    disposed = true
    media.removeEventListener('change', onChange)
    const mounted = fiber
    fiber = undefined
    if (mounted !== undefined) void mounted.dispose()
  }
}

export const inject = ['slots', 'theme', 'locale', 'sessions', 'sessionLogDownload', 'layout']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-local-link: locale dictionaries')

  ctx.effect(() => installResponsiveMobileLayout(
    window.matchMedia(MOBILE_VIEW_MEDIA_QUERY),
    () => ctx.plugin(applyResponsiveMobileEnhancements),
  ), 'dsh-local-link: responsive mobile root')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-local-link'
    style.textContent = styles
    document.head.append(style)
    return () => style.remove()
  }, 'dsh-local-link: interface styles')

  ctx.effect(() => {
    const getCurrentSessionId = (): string | undefined => ctx.sessions.list.getSnapshot().current
    const Footer = (props: FooterProps): React.JSX.Element => <LocalLinkFooter {...props} getCurrentSessionId={getCurrentSessionId} />
    return ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'local-link-connect',
      order: -10,
      locale: NS,
    }, Footer))
  }, 'dsh-local-link: sidebar connection action')

  ctx.effect(() => {
    if (!desktopOrigin()) return () => undefined
    return ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'local-access-devices',
      order: 12,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    }, LocalLinkSettings))
  }, 'dsh-local-link: paired devices settings')
}
