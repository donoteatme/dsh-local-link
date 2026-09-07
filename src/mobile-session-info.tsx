import React, { useEffect, useSyncExternalStore } from 'react'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionLogDownloadState } from '@deepseek-ai/dsh-session-log-export/client'
import {
  Button,
  IconAgentPresetOutline16,
  IconCloseOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFolderOpenOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext } from './client-context.js'
import { useMobileDialog } from './mobile-dialog.js'

const NS = 'dsh.localLink'
type SessionLogDownloadController = ClientContext['sessionLogDownload']
export const MOBILE_SESSION_INFO_TRIGGER_ID = 'dsh-local-link.mobile-session-info'
export const MOBILE_SESSION_INFO_OVERLAY_ID = 'dsh-local-link.mobile-session-info-drawer'
export const MOBILE_AGENT_PRESET_PRIORITY = -100
export const MOBILE_SESSION_LOG_PRIORITY = -100
export const MOBILE_STATS_PRIORITY = -100

interface ContextOccupancy {
  readonly percent: number
  readonly usedTokens: number
  readonly contextWindow: number
}

interface ContextBreakdown {
  readonly systemTokens: number
  readonly toolsTokens: number
  readonly messageTokens: number
}

interface SessionStats {
  readonly turns: number
  readonly steps: number
  readonly llmMs: number
  readonly toolMs: number
  readonly ttftMs: number
  readonly ttftSteps: number
  readonly decodeMs: number
  readonly decodeTokens: number
}

interface TokenUsage {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

interface SessionInfoSnapshot {
  readonly open: boolean
  readonly modelSessionId?: string
  readonly model?: string
}

interface AgentPresetProjection {
  readonly agentPreset?: string
}

function sessionAgentPreset(summary: SessionSummary): string | undefined {
  return (summary.projectionValues as AgentPresetProjection | undefined)?.agentPreset
}

interface ObservableStore<T> {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => T
}

interface ModelDirectoryLike {
  readonly store: ObservableStore<unknown>
}

interface ModelDirectoryResolverLike {
  readonly directoryFor: (sessionId: unknown) => ModelDirectoryLike
}

export class MobileSessionInfoController {
  private snapshot: SessionInfoSnapshot = Object.freeze({ open: false })
  private readonly listeners = new Set<() => void>()
  private readonly modelSubscriptions = new Map<() => void, { readonly sessionId: unknown; unsubscribe: (() => void) | undefined }>()
  private modelResolver: ModelDirectoryResolverLike | undefined

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): SessionInfoSnapshot => this.snapshot

  attachModelResolver(resolver: ModelDirectoryResolverLike): () => void {
    this.modelResolver = resolver
    for (const [listener, subscription] of this.modelSubscriptions) {
      subscription.unsubscribe?.()
      subscription.unsubscribe = this.modelDirectory(subscription.sessionId)?.store.subscribe(listener)
      listener()
    }
    return () => {
      if (this.modelResolver !== resolver) return
      this.modelResolver = undefined
      for (const [listener, subscription] of this.modelSubscriptions) {
        subscription.unsubscribe?.()
        subscription.unsubscribe = undefined
        listener()
      }
    }
  }

  subscribeModel(sessionId: unknown, listener: () => void): () => void {
    const subscription = { sessionId, unsubscribe: this.modelDirectory(sessionId)?.store.subscribe(listener) }
    this.modelSubscriptions.set(listener, subscription)
    return () => {
      subscription.unsubscribe?.()
      this.modelSubscriptions.delete(listener)
    }
  }

  getModel(sessionId: unknown): string | undefined {
    return currentModelName(this.modelDirectory(sessionId)?.store.getSnapshot())
  }

  open(): void {
    this.update(true)
  }

  close(): void {
    this.update(false)
  }

  reportModel(sessionId: string, model: string | undefined): void {
    if (this.snapshot.modelSessionId === sessionId && this.snapshot.model === model) return
    this.snapshot = Object.freeze(model === undefined
      ? { open: this.snapshot.open, modelSessionId: sessionId }
      : { open: this.snapshot.open, modelSessionId: sessionId, model })
    for (const listener of this.listeners) listener()
  }

  private update(open: boolean): void {
    if (open === this.snapshot.open) return
    this.snapshot = Object.freeze({ ...this.snapshot, open })
    for (const listener of this.listeners) listener()
  }

  private modelDirectory(sessionId: unknown): ModelDirectoryLike | undefined {
    try {
      return this.modelResolver?.directoryFor(sessionId)
    } catch {
      return undefined
    }
  }
}

type TriggerProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & { readonly controller: MobileSessionInfoController }

type DrawerProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & { readonly controller: MobileSessionInfoController; readonly downloads: SessionLogDownloadController }

export function mobilePresetLabel(preset: string | undefined, t: TriggerProps['t']): string {
  if (preset === undefined) return t('mobile.sessionInfo.notRecorded')
  switch (preset) {
    case 'standard': return t('mobile.sessionInfo.preset.standard')
    case 'code': return t('mobile.sessionInfo.preset.code')
    case 'minimal': return t('mobile.sessionInfo.preset.minimal')
    case 'cordis': return t('mobile.sessionInfo.preset.cordis')
    default: return preset
  }
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? value as Readonly<Record<string, unknown>> : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function formatSessionTokens(value: number): string {
  const scaled = (n: number): string => n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

export function formatSessionDuration(ms: number): string {
  const seconds = ms / 1_000
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

export function contextOccupancy(value: unknown): ContextOccupancy | undefined {
  const pressure = recordOf(value)
  const usedTokens = finiteNumber(pressure?.projectedTokens) ?? finiteNumber(pressure?.pressureTokens)
  const contextWindow = finiteNumber(pressure?.contextWindow)
  if (usedTokens === undefined || contextWindow === undefined || contextWindow <= 0) return undefined
  return { percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)), usedTokens, contextWindow }
}

export function contextBreakdown(value: unknown): ContextBreakdown | undefined {
  const breakdown = recordOf(value)
  const systemTokens = finiteNumber(breakdown?.systemTokens)
  const toolsTokens = finiteNumber(breakdown?.toolsTokens)
  const messageTokens = finiteNumber(breakdown?.messageTokens)
  if (systemTokens === undefined || toolsTokens === undefined || messageTokens === undefined) return undefined
  return { systemTokens, toolsTokens, messageTokens }
}

export function permissionName(value: unknown): string | undefined {
  const selection = recordOf(value)
  const currentValue = typeof selection?.currentValue === 'string' ? selection.currentValue : undefined
  if (currentValue === undefined || !Array.isArray(selection?.options)) return undefined
  const current = selection.options.find(option => recordOf(option)?.value === currentValue)
  const name = recordOf(current)?.name
  return typeof name === 'string' ? name : currentValue
}

export function permissionValue(value: unknown): string | undefined {
  const selection = recordOf(value)
  return typeof selection?.currentValue === 'string' ? selection.currentValue : undefined
}

export function currentModelName(value: unknown): string | undefined {
  const directory = recordOf(value)
  const current = recordOf(directory?.current)
  const providerId = typeof current?.provider === 'string' ? current.provider : undefined
  const modelId = typeof current?.model === 'string' ? current.model : undefined
  if (modelId === undefined) return undefined
  if (!Array.isArray(directory?.groups)) return modelId
  const group = directory.groups.map(recordOf).find(candidate => candidate?.id === providerId)
  if (!Array.isArray(group?.models)) return modelId
  const model = group.models.map(recordOf).find(candidate => candidate?.id === modelId)
  return typeof model?.name === 'string' ? model.name : modelId
}

export function lastUsedModel(value: unknown): string | undefined {
  const nodes = recordOf(value)?.nodes
  if (!Array.isArray(nodes)) return undefined
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = recordOf(nodes[index])
    if (node?.kind !== 'assistant') continue
    const identity = recordOf(node.requestConfig) ?? recordOf(node.provenance)
    const model = typeof identity?.model === 'string' ? identity.model : undefined
    if (model === undefined) continue
    const provider = typeof identity?.provider === 'string' ? identity.provider : ''
    return provider.length > 0 ? `${provider} · ${model}` : model
  }
  return undefined
}

function sessionStats(value: unknown): SessionStats | undefined {
  const stats = recordOf(value)
  const keys = ['turns', 'steps', 'llmMs', 'toolMs', 'ttftMs', 'ttftSteps', 'decodeMs', 'decodeTokens'] as const
  const entries = keys.map(key => finiteNumber(stats?.[key]))
  if (entries.some(entry => entry === undefined)) return undefined
  const [turns, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens] = entries as [number, number, number, number, number, number, number, number]
  return { turns, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens }
}

function tokenUsage(value: unknown): TokenUsage | undefined {
  const usage = recordOf(value)
  const uncachedInputTokens = finiteNumber(usage?.uncachedInputTokens)
  const outputTokens = finiteNumber(usage?.outputTokens)
  const cacheReadTokens = finiteNumber(usage?.cacheReadTokens)
  const cacheWriteTokens = finiteNumber(usage?.cacheWriteTokens)
  if (uncachedInputTokens === undefined || outputTokens === undefined || cacheReadTokens === undefined || cacheWriteTokens === undefined) return undefined
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

function sessionStatLines(projections: Readonly<Record<string, unknown>>, t: TriggerProps['t']): readonly string[] {
  const stats = sessionStats(projections.sessionStats)
  const usage = tokenUsage(projections.tokenUsage)
  const lines: string[] = []
  if (stats !== undefined && stats.steps > 0) {
    lines.push(t('mobile.sessionInfo.stats.counts', { turns: stats.turns, steps: stats.steps }))
    const durations: string[] = []
    if (stats.llmMs > 0) durations.push(t('mobile.sessionInfo.stats.llm', { duration: formatSessionDuration(stats.llmMs) }))
    if (stats.toolMs > 0) durations.push(t('mobile.sessionInfo.stats.tools', { duration: formatSessionDuration(stats.toolMs) }))
    if (durations.length > 0) lines.push(durations.join(' · '))
    const speeds: string[] = []
    if (stats.ttftSteps > 0) speeds.push(t('mobile.sessionInfo.stats.ttft', { duration: formatSessionDuration(stats.ttftMs / stats.ttftSteps) }))
    if (stats.decodeMs > 0) speeds.push(t('mobile.sessionInfo.stats.throughput', { throughput: formatSessionTokens(stats.decodeTokens / (stats.decodeMs / 1_000)) }))
    if (speeds.length > 0) lines.push(speeds.join(' · '))
  }
  if (usage !== undefined) {
    const input = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
    if (input > 0 || usage.outputTokens > 0) {
      if (input > 0) lines.push(t('mobile.sessionInfo.stats.cache', { percent: Math.round(usage.cacheReadTokens / input * 100) }))
      lines.push(t('mobile.sessionInfo.stats.tokens', { input: formatSessionTokens(input), output: formatSessionTokens(usage.outputTokens) }))
    }
  }
  return lines
}

function ContextRing({ occupancy }: { readonly occupancy: ContextOccupancy }): React.JSX.Element {
  const radius = 5.5
  const circumference = 2 * Math.PI * radius
  return <svg aria-hidden="true" className="dllm-context-ring" viewBox="0 0 14 14">
    <circle className="dllm-context-ring-track" cx="7" cy="7" r={radius} />
    <circle className="dllm-context-ring-fill" cx="7" cy="7" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - occupancy.percent / 100)} transform="rotate(-90 7 7)" />
  </svg>
}

const permissionShieldOutline = 'M8.20554 0.899994L14.7901 3.36857V7.01026C14.7901 12 11.0466 14.2103 8.20554 15.3C5.36446 14.2103 1.62012 12 1.62012 7.01026V3.36857L8.20554 0.899994Z'

function PermissionGlyph({ value }: { readonly value: string | undefined }): React.JSX.Element | null {
  if (value === 'read-only') return <svg aria-hidden="true" viewBox="0 0 16 16">
    <path d={permissionShieldOutline} fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.31831" />
    <path d="M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z" fill="currentColor" />
  </svg>
  if (value === 'workspace-write') return <svg aria-hidden="true" viewBox="0 0 16 16">
    <path d="M8.08887 0.251709C8.20479 0.23085 8.32486 0.241168 8.43652 0.282959L15.0215 2.75171C15.2787 2.84819 15.4492 3.09414 15.4492 3.3689V7.0105C15.4492 7.10986 15.4441 7.2081 15.4414 7.30542C15.0285 7.07175 14.5905 6.87695 14.1309 6.73022V3.82495L8.20508 1.60327L2.2793 3.82495V7.0105C2.27936 9.7171 3.4745 11.5379 5.02734 12.7947C5.01025 12.9942 5 13.1962 5 13.4001C5.00001 13.7617 5.02722 14.1169 5.08008 14.4636C2.91555 13.0393 0.961014 10.752 0.960938 7.0105V3.3689C0.960938 3.09417 1.13146 2.84821 1.38867 2.75171L7.97461 0.282959L8.08887 0.251709Z" fill="currentColor" />
    <path d="M11.3525 5.64688V6.85688H5V5.64688H11.3525ZM9.5824 8.29376V9.50376H5V8.29376H9.5824ZM14.6647 15.6852H10.0338C10.3878 15.3751 10.7567 15.0517 11.0772 14.7706C11.2531 14.6164 11.4144 14.4746 11.5511 14.3547H14.6647V15.6852Z" fill="currentColor" />
    <path d="M8.14852 14.1308L7.33925 15.4976C7.22458 15.6912 7.42245 15.9194 7.63037 15.8333L9.09785 15.2254L15.0399 10.0719L14.0905 8.97733L8.14852 14.1308Z" fill="currentColor" />
  </svg>
  if (value === 'danger-full-access') return <svg aria-hidden="true" viewBox="0 0 16 16">
    <path d={permissionShieldOutline} fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.31831" />
    <path d="M9.10094 4.5V8.75939H7.59888V4.5H9.10094ZM9.10094 9.8114V11.5H7.59888V9.8114H9.10094Z" fill="currentColor" />
  </svg>
  return null
}

function MobileSessionInfoTrigger({ controller, sessionId, t, useSession }: TriggerProps): React.JSX.Element {
  const selectedModel = useSyncExternalStore(
    listener => controller.subscribeModel(sessionId, listener),
    () => controller.getModel(sessionId),
  )
  const usedModel = useSession(lastUsedModel)
  const model = selectedModel ?? usedModel
  useEffect(() => controller.reportModel(String(sessionId), model), [controller, model, sessionId])
  return <Button
    aria-label={t('mobile.sessionInfo.open')}
    className="dllm-session-info-trigger"
    title={t('mobile.sessionInfo.open')}
    size="sm"
    variant="toolbar"
    onClick={() => controller.open()}
  >
    <svg aria-hidden="true" className="dllm-session-info-glyph" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.8v5.2M12 8h.01" />
    </svg>
  </Button>
}

function MobileSessionInfoDrawer({ controller, downloads, t, useSessions }: DrawerProps): React.JSX.Element | null {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const current = useSessions((snapshot: import('@deepseek-ai/dsh-api-session-controller/client').SessionListState) => snapshot.current)
  const session = useSessions((snapshot: import('@deepseek-ai/dsh-api-session-controller/client').SessionListState) => current === undefined ? undefined : snapshot.byId[current]) as SessionSummary | undefined
  const downloadState = useSyncExternalStore<SessionLogDownloadState>(downloads.store.subscribe, downloads.store.getSnapshot)
  const download = session === undefined ? undefined : downloadState.bySession[String(session.id)]
  const downloading = download?.status === 'downloading'
  const projections = (session?.projectionValues ?? {}) as Readonly<Record<string, unknown>>
  const occupancy = contextOccupancy(projections.contextPressure)
  const breakdown = contextBreakdown(projections.contextBreakdown)
  const access = permissionName(projections.permissions)
  const accessValue = permissionValue(projections.permissions)
  const model = state.modelSessionId === String(session?.id) ? state.model : undefined
  const stats = sessionStatLines(projections, t)
  const close = (): void => {
    if (session !== undefined) downloads.dismiss(session.id)
    controller.close()
  }
  const dialog = useMobileDialog(state.open && session !== undefined, close)

  if (!state.open || session === undefined) return null
  return <div className="dllm-session-info-layer">
    <Button aria-label={t('mobile.sessionInfo.close')} className="dllm-session-info-backdrop" size="sm" variant="ghost" onClick={close} />
    <aside aria-label={t('mobile.sessionInfo.title')} aria-modal="true" className="dllm-session-info-drawer" ref={dialog} role="dialog" tabIndex={-1}>
      <header className="dllm-session-info-header">
        <div><small>{t('mobile.sessionInfo.eyebrow')}</small><h2>{session.displayTitle}</h2></div>
        <Button aria-label={t('mobile.sessionInfo.close')} size="sm" variant="ghost" onClick={close}>
          <IconCloseOutline16 size={16} />
        </Button>
      </header>
      <div className="dllm-session-info-body">
        {occupancy !== undefined && <section className="dllm-session-info-card dllm-session-context-card">
          <div className="dllm-session-info-row">
            <ContextRing occupancy={occupancy} />
            <div><small>{t('mobile.sessionInfo.context')}</small><strong>{occupancy.percent}% · {formatSessionTokens(occupancy.usedTokens)} / {formatSessionTokens(occupancy.contextWindow)}</strong></div>
          </div>
          {breakdown !== undefined && (breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens) > 0 && <>
            <div className="dllm-context-breakdown-bar" aria-hidden="true">
              <span className="dllm-context-segment dllm-context-system" style={{ width: `${occupancy.percent * breakdown.systemTokens / (breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens)}%` }} />
              <span className="dllm-context-segment dllm-context-tools" style={{ width: `${occupancy.percent * breakdown.toolsTokens / (breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens)}%` }} />
              <span className="dllm-context-segment dllm-context-messages" style={{ width: `${occupancy.percent * breakdown.messageTokens / (breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens)}%` }} />
            </div>
            <div className="dllm-context-breakdown-rows">
              <div><span><i className="dllm-context-swatch dllm-context-system" />{t('mobile.sessionInfo.context.system')}</span><span>~{formatSessionTokens(breakdown.systemTokens)}</span></div>
              <div><span><i className="dllm-context-swatch dllm-context-tools" />{t('mobile.sessionInfo.context.tools')}</span><span>~{formatSessionTokens(breakdown.toolsTokens)}</span></div>
              <div><span><i className="dllm-context-swatch dllm-context-messages" />{t('mobile.sessionInfo.context.messages')}</span><span>~{formatSessionTokens(breakdown.messageTokens)}</span></div>
            </div>
          </>}
        </section>}
        <section className="dllm-session-info-card dllm-session-properties-card">
          <div className="dllm-session-property"><small>{t('mobile.sessionInfo.model')}</small><span>{model ?? t('mobile.sessionInfo.notRecorded')}</span></div>
          <div className="dllm-session-property"><small className="dllm-session-property-label"><IconFolderOpenOutline16 size={13} />{t('mobile.sessionInfo.permissions')}</small><span className="dllm-session-property-value dllm-session-property-access"><PermissionGlyph value={accessValue} />{access ?? t('mobile.sessionInfo.notRecorded')}</span></div>
          <div className="dllm-session-property"><small className="dllm-session-property-label"><IconAgentPresetOutline16 size={13} />{t('mobile.sessionInfo.agentPreset')}</small><span>{mobilePresetLabel(sessionAgentPreset(session), t)}</span></div>
        </section>
        {stats.length > 0 && <section className="dllm-session-info-card dllm-session-stats-card">
          <div className="dllm-session-info-icon" aria-hidden="true"><IconDataOutline16 size={15} /></div>
          <div><small>{t('mobile.sessionInfo.statistics')}</small>{stats.map(line => <p key={line}>{line}</p>)}</div>
        </section>}
        <section className="dllm-session-info-card dllm-session-log-card">
          <div className="dllm-session-info-icon" aria-hidden="true"><IconDownloadOutline16 size={17} /></div>
          <div><small>{t('mobile.sessionInfo.sessionLog')}</small><p>{t('mobile.sessionInfo.sessionLogDescription')}</p>
            {download?.status === 'error' && <p className="dllm-session-log-error">{download.error ?? t('mobile.sessionInfo.sessionLogError')}</p>}
            {download?.status === 'success' && <p>{t('mobile.sessionInfo.sessionLogReady')}</p>}
          </div>
          <Button className="dllm-session-log-download" disabled={downloading} size="sm" variant="outline" onClick={() => void downloads.download(session.id)}>
            {t(downloading ? 'mobile.sessionInfo.sessionLogDownloading' : 'mobile.sessionInfo.sessionLogDownload')}
          </Button>
        </section>
      </div>
    </aside>
  </div>
}

export const MOBILE_SESSION_INFO_STYLES = `
.dllm-session-info-trigger{display:grid;width:44px;height:44px;margin:0;padding:0;place-items:center;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(148 163 184 / 30%));border-radius:12px;color:inherit;background:var(--dsw-alias-bg-layer-1,rgb(255 255 255 / 92%));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgb(15 23 42 / 14%));cursor:pointer}
.dllm-session-info-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgb(127 127 127 / 18%))}
.dllm-session-info-glyph{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.dllm-session-info-layer{position:fixed;z-index:120;inset:0;display:flex;justify-content:flex-end;pointer-events:auto}.dllm-session-info-backdrop{position:absolute;inset:0;width:auto;height:auto;min-height:0;padding:0;border:0;border-radius:0;background:var(--dsw-alias-bg-mask-1,rgb(15 23 42 / 46%))!important}
.dllm-session-info-drawer{position:relative;box-sizing:border-box;display:flex;width:var(--dllm-side-drawer-width);height:100dvh;flex-direction:column;padding-top:env(safe-area-inset-top);border-left:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 22%));color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:-18px 0 52px rgb(15 23 42 / 24%);animation:dllm-session-info-in 180ms cubic-bezier(.22,1,.36,1)}
.dllm-session-info-header{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:12px;padding:18px 16px 14px!important;border-bottom:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 18%))}.dllm-session-info-header>div{min-width:0}.dllm-session-info-header small{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.dllm-session-info-header h2{margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;line-height:23px}.dllm-session-info-header button{display:grid;width:32px;height:32px;flex:none;padding:0;place-items:center;border:0;border-radius:50%;color:var(--dsw-alias-label-secondary,inherit);background:transparent}.dllm-session-info-header button:hover{background:var(--dsw-alias-interactive-bg-hover,rgb(127 127 127 / 14%))}.dllm-session-info-header button>svg{width:16px;height:16px}
.dllm-session-info-body{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;padding:12px 12px calc(14px + env(safe-area-inset-bottom));overflow-y:auto}.dllm-session-info-card{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;padding:10px;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 18%));border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-base,transparent) 62%,transparent)}.dllm-session-info-icon{display:grid;width:24px;height:24px;place-items:center;color:var(--dsw-alias-label-tertiary,#6b7280)}.dllm-session-info-card small{display:block;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:10.5px;line-height:15px}.dllm-session-info-card strong{display:block;margin-top:1px;font-size:13px;font-weight:500;line-height:18px}.dllm-session-info-card p{margin:2px 0 0;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11.5px;line-height:17px}.dllm-session-log-card{grid-template-columns:28px minmax(0,1fr);align-items:start}.dllm-session-log-download{grid-column:2;width:fit-content;margin-top:5px}.dllm-session-log-error{color:var(--dsw-alias-state-error-primary,#dc2626)!important;overflow-wrap:anywhere}
.dllm-session-context-card{display:block;padding:3px 10px 8px}.dllm-session-info-row{display:grid;min-width:0;grid-template-columns:26px minmax(0,1fr);gap:8px;align-items:center;padding:7px 0}.dllm-session-info-row>div{min-width:0}.dllm-session-info-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dllm-context-ring{display:block;width:16px;height:16px;margin:auto;overflow:visible}.dllm-context-ring-track,.dllm-context-ring-fill{fill:none;stroke-width:1.6}.dllm-context-ring-track{stroke:var(--dsw-alias-border-l3,rgb(127 127 127 / 24%))}.dllm-context-ring-fill{stroke:var(--dsw-alias-label-tertiary,#6b7280);stroke-linecap:round}.dllm-context-breakdown-bar{display:flex;height:4px;margin:2px 0 7px;gap:1px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgb(127 127 127 / 12%))}.dllm-context-segment{height:100%;min-width:2px;border-radius:1px;background:var(--meter-tint)}.dllm-context-system{--meter-tint:var(--dsw-static-neutral-bluish-400,#8a94a6)}.dllm-context-tools{--meter-tint:#a78bfa}.dllm-context-messages{--meter-tint:var(--dsw-static-blue-450,#4f8cff)}.dllm-context-breakdown-rows{display:grid;gap:1px}.dllm-context-breakdown-rows>div{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:10.5px;line-height:16px}.dllm-context-breakdown-rows>div>span:last-child{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,inherit)}.dllm-context-swatch{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:2px;background:var(--meter-tint)}.dllm-session-properties-card{display:block;padding:2px 10px}.dllm-session-property{display:grid;grid-template-columns:minmax(92px,38%) minmax(0,1fr);gap:10px;align-items:baseline;padding:7px 0}.dllm-session-property+.dllm-session-property{border-top:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 14%))}.dllm-session-property-label{display:inline-flex!important;min-width:0;align-items:center;gap:5px}.dllm-session-property-label svg{width:13px;height:13px;flex:none}.dllm-session-property span{overflow:hidden;color:var(--dsw-alias-label-primary,inherit);font-size:12px;font-weight:400;line-height:17px;text-align:right;text-overflow:ellipsis;white-space:nowrap}.dllm-session-property-value{display:inline-flex;min-width:0;align-items:center;justify-content:flex-end;gap:5px}.dllm-session-property-access svg{width:14px;height:14px;flex:none}.dllm-session-stats-card p{font-variant-numeric:tabular-nums}.dllm-session-stats-card p:first-of-type{margin-top:2px}
@keyframes dllm-session-info-in{from{transform:translateX(100%)}to{transform:translateX(0)}}@media(prefers-reduced-motion:reduce){.dllm-session-info-drawer{animation:none!important}}
`

export function applyMobileSessionInfo(ctx: ClientContext): void {
  const controller = new MobileSessionInfoController()
  ctx.inject(['modelDirectories'], scope => {
    const resolver = (scope as unknown as { modelDirectories?: ModelDirectoryResolverLike }).modelDirectories
    if (resolver === undefined) return
    scope.effect(() => controller.attachModelResolver(resolver), 'dsh-local-link: current model directory bridge')
  })
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'agent-preset',
    priority: MOBILE_AGENT_PRESET_PRIORITY,
  }, () => null)), 'dsh-local-link: move mobile agent preset out of header')
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'session-log-download',
    priority: MOBILE_SESSION_LOG_PRIORITY,
  }, () => null)), 'dsh-local-link: move mobile session log out of header')
  ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'stats',
    priority: MOBILE_STATS_PRIORITY,
  }, () => null)), 'dsh-local-link: move mobile session statistics into session info')
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: MOBILE_SESSION_INFO_TRIGGER_ID,
    order: 90,
    locale: NS,
  }, props => <MobileSessionInfoTrigger {...props} controller={controller} />)), 'dsh-local-link: mobile session info trigger')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: MOBILE_SESSION_INFO_OVERLAY_ID,
    order: 40,
    locale: NS,
  }, props => <MobileSessionInfoDrawer {...props} controller={controller} downloads={ctx.sessionLogDownload} />)), 'dsh-local-link: mobile session info drawer')
}
