import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { SubagentAddress, SubagentListEntry } from '@deepseek-ai/dsh-subagent/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { Button, IconChevronRightOutline14, IconCloseOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext } from './client-context.js'
import { useMobileDialog } from './mobile-dialog.js'

const NS = 'dsh.localLink'
export const MOBILE_SUBAGENT_DOCK_ID = 'dsh-local-link.mobile-subagents'
export const MOBILE_SUBAGENT_OVERLAY_ID = 'dsh-local-link.mobile-subagent-sheet'
export const MOBILE_SUBAGENT_LINEAGE_PRIORITY = -100

interface SubagentMetrics {
  readonly count: number
  readonly runningCount: number
}

interface TokenUsageProjection {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

interface SubagentTimingProjection {
  readonly settledMs: number
  readonly active?: {
    readonly since: number
    readonly through: number
  }
}

interface MobileSubagentProjections {
  readonly tokenUsage?: TokenUsageProjection
  readonly subagentTiming?: SubagentTimingProjection
}

function mobileSubagentProjections(summary: SessionSummary | undefined): MobileSubagentProjections {
  return (summary?.projectionValues ?? {}) as unknown as MobileSubagentProjections
}

/** Compact token count, matching the stock Harness subagent catalog. */
export function formatMobileSubagentTokens(value: number): string {
  const scaled = (next: number): string => next >= 100 ? String(Math.round(next)) : String(Math.round(next * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

/** Sum the four disjoint durable provider-usage buckets used by Harness. */
export function mobileSubagentTokenTotal(usage: TokenUsageProjection | undefined): number | undefined {
  return usage === undefined
    ? undefined
    : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Active-turn duration, including settled spans, matching the stock catalog. */
export function mobileSubagentActivityDuration(
  summary: SessionSummary | undefined,
  activity: 'running' | 'inactive',
  now: number,
): number | undefined {
  const timing = mobileSubagentProjections(summary).subagentTiming
  if (timing === undefined) return undefined
  if (timing.active === undefined) return timing.settledMs
  const end = activity === 'running' ? now : timing.active.through
  return timing.settledMs + Math.max(0, end - timing.active.since)
}

function formatMobileSubagentDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1_000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)
  if (days > 0) return `${days}d ${hours}h`
  if (totalHours > 0) return `${totalHours}h ${String(minutes).padStart(2, '0')}m`
  if (totalMinutes > 0) return `${totalMinutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

interface SheetSnapshot {
  readonly rootSessionId?: SessionId
}

class MobileSubagentController {
  private snapshot: SheetSnapshot = Object.freeze({})
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): SheetSnapshot => this.snapshot

  open(rootSessionId: SessionId): void {
    this.update(Object.freeze({ rootSessionId }))
  }

  close(): void {
    this.update(Object.freeze({}))
  }

  private update(snapshot: SheetSnapshot): void {
    if (snapshot.rootSessionId === this.snapshot.rootSessionId) return
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

interface SubagentActions {
  readonly open: (address: SubagentAddress) => void
  readonly refresh: (parentSessionId: SessionId) => Promise<void>
  readonly observe: (parentSessionId: SessionId, open: boolean) => void
}

type TriggerProps = PropsRuntime<'conversation.input.dock'>
  & PropsLocale<typeof NS>
  & { readonly controller: MobileSubagentController }

type SheetProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & { readonly actions: SubagentActions; readonly controller: MobileSubagentController }

type LineageProps = PropsRuntime<'conversation.session.header.lineage'>
  & PropsLocale<typeof NS>

/** Resolve the catalog shown for an ordinary session or its currently opened child. */
export function mobileSubagentRoot(sessionId: SessionId, summaries: Readonly<Record<SessionId, SessionSummary>>): SessionId {
  const summary = summaries[sessionId]
  return summary?.origin === 'subagent' && summary.parentId !== undefined ? summary.parentId : sessionId
}

/** Count the uninterrupted subagent-origin tree without creating a second data store. */
export function mobileSubagentMetrics(rootSessionId: SessionId, summaries: Readonly<Record<SessionId, SessionSummary>>): SubagentMetrics {
  let count = 0
  let runningCount = 0
  for (const summary of Object.values(summaries)) {
    if (summary.origin !== 'subagent') continue
    let cursor: SessionSummary | undefined = summary
    const visited = new Set<SessionId>()
    while (cursor?.origin === 'subagent' && cursor.parentId !== undefined && !visited.has(cursor.id)) {
      visited.add(cursor.id)
      if (cursor.parentId === rootSessionId) {
        count += 1
        if (summary.running) runningCount += 1
        break
      }
      cursor = summaries[cursor.parentId]
    }
  }
  return Object.freeze({ count, runningCount })
}

function directCatalogMetrics(rootSessionId: SessionId, catalogs: SessionListState['subagentsByParent']): SubagentMetrics {
  const entries = catalogs[rootSessionId]?.entries ?? []
  const healthy = entries.filter((entry): entry is Extract<SubagentListEntry, { kind: 'child' }> => entry.kind === 'child')
  return {
    count: healthy.length,
    runningCount: healthy.filter(entry => entry.activity === 'running').length,
  }
}

function MobileSubagentTrigger({ controller, sessionId, t, useSessions }: TriggerProps): React.JSX.Element | null {
  const summaries = useSessions((state: SessionListState) => state.byId)
  const catalogs = useSessions((state: SessionListState) => state.subagentsByParent)
  const rootSessionId = mobileSubagentRoot(sessionId, summaries)
  const metrics = useMemo(() => mobileSubagentMetrics(rootSessionId, summaries), [rootSessionId, summaries])
  const direct = useMemo(() => directCatalogMetrics(rootSessionId, catalogs), [catalogs, rootSessionId])
  const count = Math.max(metrics.count, direct.count)
  const runningCount = Math.max(metrics.runningCount, direct.runningCount)
  if (count === 0) return null
  const label = t('mobile.subagents.total', { count })
  const activityLabel = t('mobile.subagents.running', { count: runningCount })
  return <Button aria-label={`${label}. ${activityLabel}`} className="dllm-subagent-chip" size="md" variant="outline" onClick={() => controller.open(rootSessionId)}>
    <span aria-hidden="true" className="dllm-subagent-activity"><StateDot state={runningCount > 0 ? 'ongoing' : 'done'} /></span>
    <span>{label}</span>
    <span aria-hidden="true" className="dllm-subagent-running">{activityLabel}</span>
    <IconChevronRightOutline14 className="dllm-subagent-chevron" size={14} />
  </Button>
}

function MobileLineageTitle({ displayTitle, lineageSessionId, openTitle, useSessions }: LineageProps): React.JSX.Element | null {
  const summary = useSessions((state: SessionListState) => state.byId[lineageSessionId])
  const currentRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (summary?.origin === 'subagent' && openTitle === undefined) {
      currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'end' })
    }
  }, [lineageSessionId, openTitle, summary?.origin])
  if (summary?.origin !== 'subagent') return null
  if (openTitle !== undefined) return <Button className="dllm-lineage-title dllm-lineage-ancestor" size="sm" variant="ghost" onClick={openTitle}>{displayTitle}</Button>
  return <span className="dllm-lineage-current" ref={currentRef}>
    <span className="dllm-lineage-title">{displayTitle}</span>
  </span>
}

interface CatalogRowsProps {
  readonly actions: SubagentActions
  readonly catalogs: SessionListState['subagentsByParent']
  readonly expanded: ReadonlySet<SessionId>
  readonly level: number
  readonly onOpen: (address: SubagentAddress) => void
  readonly onToggle: (parentSessionId: SessionId, open: boolean) => void
  readonly parentSessionId: SessionId
  readonly summaries: SessionListState['byId']
  readonly t: TriggerProps['t']
}

function CatalogRows({ actions, catalogs, expanded, level, onOpen, onToggle, parentSessionId, summaries, t, now }: CatalogRowsProps & { readonly now: number }): React.JSX.Element {
  const catalog = catalogs[parentSessionId]
  if (catalog === undefined || catalog.state === 'loading') {
    return <div className="dllm-subagent-state">{t('mobile.subagents.loading')}</div>
  }
  if (catalog.state === 'error') {
    return <div className="dllm-subagent-state dllm-subagent-error">
      <span>{t('mobile.subagents.error')}</span>
      <Button size="sm" variant="outline" onClick={() => void actions.refresh(parentSessionId)}>{t('mobile.subagents.retry')}</Button>
    </div>
  }
  if (catalog.entries.length === 0) return <div className="dllm-subagent-state">{t('mobile.subagents.empty')}</div>
  return <div className="dllm-subagent-tree" role="tree">
    {catalog.entries.map(entry => {
      if (entry.kind === 'diagnostic') {
        return <div className="dllm-subagent-row dllm-subagent-disabled" key={entry.id} style={{ '--dllm-level': level } as React.CSSProperties}>
          <span className="dllm-subagent-row-main"><strong>{t('mobile.subagents.unavailable')}</strong><small>{entry.reason}</small></span>
        </div>
      }
      const open = expanded.has(entry.id)
      const summary = summaries[entry.id]
      const title = entry.label ?? summary?.displayTitle ?? entry.id
      const mode = t(entry.mode === 'continuable' ? 'mobile.subagents.continuable' : 'mobile.subagents.oneShot')
      const activity = t(entry.activity === 'running' ? 'mobile.subagents.active' : 'mobile.subagents.inactive')
      const secondary = [summary?.title, mode, activity].filter((value): value is string => value !== undefined).join(' · ')
      const totalTokens = mobileSubagentTokenTotal(mobileSubagentProjections(summary).tokenUsage)
      const duration = mobileSubagentActivityDuration(summary, entry.activity, now)
      const address: SubagentAddress = {
        parentSessionId,
        childSessionId: entry.id,
        mode: entry.mode,
      }
      return <React.Fragment key={entry.id}>
        <div className="dllm-subagent-row" role="treeitem" aria-expanded={entry.hasChildren ? open : undefined} style={{ '--dllm-level': level } as React.CSSProperties}>
          {entry.hasChildren
            ? <Button aria-label={open ? t('mobile.subagents.collapse') : t('mobile.subagents.expand')} className="dllm-subagent-expand" size="sm" variant="ghost" onClick={() => onToggle(entry.id, !open)}>
                <IconChevronRightOutline14 size={14} />
              </Button>
            : <span className="dllm-subagent-expand-space" />}
          <Button className="dllm-subagent-row-main" size="md" variant="ghost" onClick={() => onOpen(address)}>
            <StateDot state={entry.activity === 'running' ? 'ongoing' : 'done'} />
            <span className="dllm-subagent-content"><strong>{title}</strong><small>{secondary}</small></span>
            {(totalTokens !== undefined || duration !== undefined) && <span className="dllm-subagent-metrics">
              {totalTokens !== undefined && <span>{formatMobileSubagentTokens(totalTokens)} tok</span>}
              {duration !== undefined && <span>{formatMobileSubagentDuration(duration)}</span>}
            </span>}
          </Button>
        </div>
        {entry.hasChildren && open && <CatalogRows
          actions={actions}
          catalogs={catalogs}
          expanded={expanded}
          level={level + 1}
          onOpen={onOpen}
          onToggle={onToggle}
          parentSessionId={entry.id}
          summaries={summaries}
          t={t}
          now={now}
        />}
      </React.Fragment>
    })}
  </div>
}

function MobileSubagentSheet({ actions, controller, t, useSessions }: SheetProps): React.JSX.Element | null {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const rootSessionId = snapshot.rootSessionId
  const catalogs = useSessions((state: SessionListState) => state.subagentsByParent)
  const summaries = useSessions((state: SessionListState) => state.byId)
  const [expanded, setExpanded] = useState<ReadonlySet<SessionId>>(() => new Set())
  const [now, setNow] = useState(() => Date.now())
  const observed = useRef(new Set<SessionId>())
  const dialog = useMobileDialog(rootSessionId !== undefined, () => controller.close())

  useEffect(() => {
    if (rootSessionId === undefined) return
    setExpanded(new Set())
    observed.current.add(rootSessionId)
    actions.observe(rootSessionId, true)
    return () => {
      for (const id of observed.current) actions.observe(id, false)
      observed.current.clear()
    }
  }, [actions, rootSessionId])

  useEffect(() => {
    if (rootSessionId === undefined) return
    const visibleParents = new Set<SessionId>([rootSessionId, ...expanded])
    const running = [...visibleParents].some(parentSessionId => catalogs[parentSessionId]?.entries
      .some((entry: SubagentListEntry) => entry.kind === 'child' && entry.activity === 'running') === true)
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [catalogs, expanded, rootSessionId])

  if (rootSessionId === undefined) return null
  const toggle = (id: SessionId, open: boolean): void => {
    const closing = new Set<SessionId>()
    if (!open) {
      const visit = (parentSessionId: SessionId): void => {
        if (closing.has(parentSessionId)) return
        closing.add(parentSessionId)
        for (const entry of catalogs[parentSessionId]?.entries ?? []) {
          if (entry.kind === 'child' && observed.current.has(entry.id)) visit(entry.id)
        }
      }
      visit(id)
      for (const closingId of closing) {
        actions.observe(closingId, false)
        observed.current.delete(closingId)
      }
    }
    setExpanded(current => {
      const next = new Set(current)
      if (open) next.add(id)
      else for (const closingId of closing) next.delete(closingId)
      return next
    })
    if (open) {
      observed.current.add(id)
      actions.observe(id, true)
    }
  }
  const open = (address: SubagentAddress): void => {
    actions.open(address)
    controller.close()
  }
  return <div className="dllm-subagent-layer" role="presentation">
    <Button aria-label={t('mobile.subagents.close')} className="dllm-subagent-backdrop" size="sm" variant="ghost" onClick={() => controller.close()} />
    <section aria-label={t('mobile.subagents.title')} aria-modal="true" className="dllm-subagent-sheet" ref={dialog} role="dialog" tabIndex={-1}>
      <div aria-hidden="true" className="dllm-subagent-handle" />
      <header className="dllm-subagent-sheet-header">
        <div><h2>{t('mobile.subagents.title')}</h2><p>{t('mobile.subagents.description')}</p></div>
        <Button aria-label={t('mobile.subagents.close')} className="dllm-subagent-close" size="sm" variant="ghost" onClick={() => controller.close()}>
          <IconCloseOutline16 size={16} />
        </Button>
      </header>
      <div className="dllm-subagent-list">
        <CatalogRows actions={actions} catalogs={catalogs} expanded={expanded} level={0} onOpen={open} onToggle={toggle} parentSessionId={rootSessionId} summaries={summaries} t={t} now={now} />
      </div>
    </section>
  </div>
}

export const MOBILE_SUBAGENT_STYLES = `
.dllm-subagent-chip{box-sizing:border-box;display:flex;width:fit-content;max-width:100%;min-height:40px;align-items:center;gap:8px;margin:0 24px 6px;padding:7px 10px;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 24%));border-radius:12px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,rgb(127 127 127 / 8%));font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.dllm-subagent-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgb(127 127 127 / 14%))}.dllm-subagent-activity{display:inline-flex;width:10px;height:10px;flex:none;align-items:center;justify-content:center}.dllm-subagent-running{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;font-weight:400;white-space:nowrap}.dllm-subagent-running::before{content:"·";margin-right:8px;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-tertiary,#6b7280))}.dllm-subagent-chevron{width:14px;height:14px;margin-left:2px}
.dllm-lineage-title{display:block;max-width:min(42vw,220px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px}.dllm-lineage-ancestor{padding:4px;border:0;border-radius:9px;color:var(--dsw-alias-label-tertiary,inherit);background:transparent;font-family:inherit;font-weight:400;cursor:pointer}.dllm-lineage-ancestor:hover{background:var(--dsw-alias-interactive-bg-hover,rgb(127 127 127 / 12%))}.dllm-lineage-current{display:inline-flex;min-width:0;align-items:center;padding:4px;color:var(--dsw-alias-label-primary,inherit);font-weight:500}.dllm-shell header nav:has(.dllm-lineage-title){gap:0!important;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}.dllm-shell header nav:has(.dllm-lineage-title)>span{gap:1px!important}.dllm-shell header nav:has(.dllm-lineage-title)>span>button{padding-inline:4px!important;font-size:14px!important;line-height:20px!important}.dllm-shell header nav:has(.dllm-lineage-title)::-webkit-scrollbar{display:none}
.dllm-subagent-layer{position:fixed;z-index:110;inset:0;display:flex;align-items:flex-end;pointer-events:auto}.dllm-subagent-backdrop{position:absolute;inset:0;width:auto;height:auto;min-height:0;padding:0;border:0;border-radius:0;background:var(--dsw-alias-bg-mask-1,rgb(15 23 42 / 48%))!important}
.dllm-subagent-sheet{position:relative;box-sizing:border-box;display:flex;width:100%;max-height:min(78dvh,720px);flex-direction:column;padding:0 0 env(safe-area-inset-bottom);overflow:hidden;border:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 26%));border-bottom:0;border-radius:22px 22px 0 0;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 -18px 50px rgb(15 23 42 / 22%)}
.dllm-subagent-handle{width:38px;height:4px;margin:9px auto 4px;border-radius:999px;background:var(--dsw-alias-border-l2,rgb(127 127 127 / 30%))}.dllm-subagent-sheet-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 18px 14px;border-bottom:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 18%))}.dllm-subagent-sheet-header h2{margin:0;font-size:18px;line-height:24px}.dllm-subagent-sheet-header p{margin:3px 0 0;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;line-height:18px}.dllm-subagent-close{display:grid;width:40px;height:40px;flex:0 0 auto;padding:0;place-items:center;border:0;border-radius:10px;color:inherit;background:transparent}.dllm-subagent-close svg{width:16px;height:16px}
.dllm-subagent-list{min-height:120px;overflow:auto;padding:8px 10px 16px;overscroll-behavior:contain}.dllm-subagent-tree{display:flex;flex-direction:column}.dllm-subagent-row{display:flex;min-height:54px;align-items:center;padding-left:calc(var(--dllm-level) * 14px);border-bottom:var(--dsh-local-link-border-width) solid var(--dsw-alias-border-l2,rgb(127 127 127 / 13%))}.dllm-subagent-expand,.dllm-subagent-expand-space{display:grid;width:36px;height:44px;flex:0 0 auto;place-items:center}.dllm-subagent-expand{padding:0;border:0;color:inherit;background:transparent}.dllm-subagent-expand svg{width:14px;height:14px;transition:transform 120ms ease}.dllm-subagent-row[aria-expanded=true]>.dllm-subagent-expand svg{transform:rotate(90deg)}
.dllm-subagent-row-main{display:flex;min-width:0;height:auto;flex:1;align-items:flex-start;gap:8px;padding:7px 8px;text-align:left}.dllm-subagent-row-main>[data-state]{flex:none;margin-top:4px}.dllm-subagent-content{display:flex;min-width:0;flex:1;flex-direction:column}.dllm-subagent-content strong,.dllm-subagent-content small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dllm-subagent-content strong{font-size:13px;font-weight:500;line-height:18px}.dllm-subagent-content small,.dllm-subagent-metrics{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;line-height:16px}.dllm-subagent-metrics{display:grid;flex:none;grid-template-rows:18px 16px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.dllm-subagent-disabled{opacity:.68}.dllm-subagent-state{display:flex;min-height:120px;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:13px}.dllm-subagent-error{color:var(--dsw-alias-status-danger,#dc2626)}
@media(prefers-reduced-motion:reduce){.dllm-subagent-expand svg{transition:none!important}}
`

export function applyMobileSubagents(ctx: ClientContext): void {
  const controller = new MobileSubagentController()
  const actions: SubagentActions = {
    observe: (parentSessionId, open) => ctx.sessions.setSubagentCatalogOpen(parentSessionId, open),
    open: address => ctx.sessions.openSubagent(address),
    refresh: parentSessionId => ctx.sessions.refreshSubagents(parentSessionId),
  }
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: MOBILE_SUBAGENT_DOCK_ID,
    order: 30,
    locale: NS,
  }, props => <MobileSubagentTrigger {...props} controller={controller} />)), 'dsh-local-link: mobile subagent dock')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: MOBILE_SUBAGENT_OVERLAY_ID,
    order: 30,
    locale: NS,
  }, props => <MobileSubagentSheet {...props} actions={actions} controller={controller} />)), 'dsh-local-link: mobile subagent sheet')
  ctx.effect(() => ctx.slots.inject('conversation.session.header.lineage', () => ctx.slots.register({
    name: 'conversation.session.header.lineage',
    priority: MOBILE_SUBAGENT_LINEAGE_PRIORITY,
    locale: NS,
  }, props => <MobileLineageTitle {...props} />)), 'dsh-local-link: compact mobile lineage title')
}
