import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import {
  MOBILE_SUBAGENT_DOCK_ID,
  MOBILE_SUBAGENT_LINEAGE_PRIORITY,
  MOBILE_SUBAGENT_OVERLAY_ID,
  MOBILE_SUBAGENT_STYLES,
  formatMobileSubagentTokens,
  mobileSubagentActivityDuration,
  mobileSubagentMetrics,
  mobileSubagentRoot,
  mobileSubagentTokenTotal,
} from '../src/mobile-subagents.js'

const id = (value: string): SessionId => value as SessionId
const summary = (value: string, parent?: string, running = false): SessionSummary => ({
  id: id(value),
  displayTitle: value,
  blank: false,
  running,
  updatedAt: 1,
  ...(parent === undefined ? {} : { origin: 'subagent' as const, parentId: id(parent) }),
})

describe('mobile subagent projection', () => {
  it('uses the parent catalog when a child conversation is open', () => {
    const summaries = { root: summary('root'), child: summary('child', 'root') }
    expect(mobileSubagentRoot(id('root'), summaries)).toBe(id('root'))
    expect(mobileSubagentRoot(id('child'), summaries)).toBe(id('root'))
  })

  it('counts nested uninterrupted subagent lineage and running descendants', () => {
    const summaries = {
      root: summary('root'),
      first: summary('first', 'root', true),
      nested: summary('nested', 'first'),
      fork: summary('fork'),
      unrelated: summary('unrelated', 'fork', true),
    }
    expect(mobileSubagentMetrics(id('root'), summaries)).toEqual({ count: 2, runningCount: 1 })
  })

  it('uses additive Harness seats and a mobile-only lineage shadow', () => {
    expect(MOBILE_SUBAGENT_DOCK_ID).toContain('mobile-subagents')
    expect(MOBILE_SUBAGENT_OVERLAY_ID).toContain('mobile-subagent-sheet')
    expect(MOBILE_SUBAGENT_LINEAGE_PRIORITY).toBeLessThan(0)
    expect(MOBILE_SUBAGENT_STYLES).toContain('.dllm-subagent-sheet')
    expect(MOBILE_SUBAGENT_STYLES).not.toContain('.dllm-lineage-parent')
    expect(MOBILE_SUBAGENT_STYLES).toContain('font-size:14px;line-height:20px')
  })

  it('matches stock Harness token and active-duration projections', () => {
    expect(formatMobileSubagentTokens(45_720)).toBe('45.7K')
    expect(mobileSubagentTokenTotal({
      uncachedInputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheWriteTokens: 40,
    })).toBe(100)
    const timed = {
      ...summary('child', 'root', true),
      projectionValues: {
        subagentTiming: {
          settledMs: 2_000,
          active: { since: 10_000, through: 12_000 },
        },
      } as unknown as NonNullable<SessionSummary['projectionValues']>,
    } satisfies SessionSummary
    expect(mobileSubagentActivityDuration(timed, 'running', 15_000)).toBe(7_000)
    expect(mobileSubagentActivityDuration(timed, 'inactive', 15_000)).toBe(4_000)
  })

  it('uses the native state dot and exposes compact activity metrics visually', () => {
    expect(MOBILE_SUBAGENT_STYLES).toContain('.dllm-subagent-activity')
    expect(MOBILE_SUBAGENT_STYLES).toContain('.dllm-subagent-running')
    expect(MOBILE_SUBAGENT_STYLES).toContain('.dllm-subagent-running::before{content:"·"')
    expect(MOBILE_SUBAGENT_STYLES).toContain('.dllm-subagent-metrics')
    expect(MOBILE_SUBAGENT_STYLES).not.toContain('.dllm-subagent-live')
    expect(MOBILE_SUBAGENT_STYLES).not.toContain('.dllm-subagent-status')
  })

  it('keeps the sheet backdrop full-viewport despite the compact Harness button size', () => {
    expect(MOBILE_SUBAGENT_STYLES).toContain('.dllm-subagent-backdrop{position:absolute;inset:0;width:auto;height:auto;min-height:0')
  })

  it('uses the shared Local Link hairline for sheet borders and separators', () => {
    expect(MOBILE_SUBAGENT_STYLES).toContain('border:var(--dsh-local-link-border-width) solid')
    expect(MOBILE_SUBAGENT_STYLES).toContain('border-bottom:var(--dsh-local-link-border-width) solid')
  })
})
