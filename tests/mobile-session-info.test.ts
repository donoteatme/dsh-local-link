import { describe, expect, it } from 'vitest'
import {
  MOBILE_AGENT_PRESET_PRIORITY,
  MOBILE_SESSION_LOG_PRIORITY,
  MOBILE_SESSION_INFO_OVERLAY_ID,
  MOBILE_SESSION_INFO_STYLES,
  MOBILE_SESSION_INFO_TRIGGER_ID,
  MOBILE_STATS_PRIORITY,
  MobileSessionInfoController,
  contextBreakdown,
  contextOccupancy,
  currentModelName,
  formatSessionDuration,
  formatSessionTokens,
  lastUsedModel,
  mobilePresetLabel,
  permissionName,
  permissionValue,
} from '../src/mobile-session-info.js'

const t = (key: string): string => ({
  'mobile.sessionInfo.notRecorded': 'Not recorded',
  'mobile.sessionInfo.preset.standard': 'Standard mode',
}[key] ?? key)

describe('mobile session information', () => {
  it('uses native additive header and overlay identities while shadowing only the preset label', () => {
    expect(MOBILE_SESSION_INFO_TRIGGER_ID).toContain('mobile-session-info')
    expect(MOBILE_SESSION_INFO_OVERLAY_ID).toContain('mobile-session-info-drawer')
    expect(MOBILE_AGENT_PRESET_PRIORITY).toBeLessThan(0)
    expect(MOBILE_SESSION_LOG_PRIORITY).toBeLessThan(0)
    expect(MOBILE_STATS_PRIORITY).toBeLessThan(0)
  })

  it('formats native context, permission, and statistics projections without polling', () => {
    expect(contextOccupancy({ projectedTokens: 65_500, contextWindow: 262_000 })).toEqual({
      percent: 25,
      usedTokens: 65_500,
      contextWindow: 262_000,
    })
    expect(contextBreakdown({ systemTokens: 4_000, toolsTokens: 8_000, messageTokens: 12_000 })).toEqual({
      systemTokens: 4_000,
      toolsTokens: 8_000,
      messageTokens: 12_000,
    })
    expect(permissionName({ currentValue: 'workspace-write', options: [{ value: 'workspace-write', name: 'Workspace write' }] })).toBe('Workspace write')
    expect(permissionValue({ currentValue: 'workspace-write', options: [{ value: 'workspace-write', name: 'Workspace write' }] })).toBe('workspace-write')
    expect(formatSessionTokens(87.349)).toBe('87.3')
    expect(formatSessionTokens(732.499999999)).toBe('732')
    expect(formatSessionTokens(65_500)).toBe('65.5K')
    expect(formatSessionDuration(162_000)).toBe('2m42s')
    expect(currentModelName({
      current: { provider: 'llama', model: 'qwen-local' },
      groups: [{ id: 'llama', models: [{ id: 'qwen-local', name: 'Qwen Local' }] }],
    })).toBe('Qwen Local')
  })

  it('keeps the model fallback compatible with both legacy and alpha conversation snapshots', () => {
    expect(lastUsedModel({ nodes: [
      { kind: 'assistant', provenance: { provider: 'llama', model: 'qwen-local' } },
    ] })).toBe('llama · qwen-local')
    expect(lastUsedModel({ messages: [] })).toBeUndefined()
    expect(lastUsedModel(undefined)).toBeUndefined()
  })

  it('opens and closes without keeping a second session store', () => {
    const controller = new MobileSessionInfoController()
    expect(controller.getSnapshot().open).toBe(false)
    controller.open()
    expect(controller.getSnapshot().open).toBe(true)
    controller.close()
    expect(controller.getSnapshot().open).toBe(false)
  })

  it('localizes built-in presets and leaves custom preset ids intact', () => {
    expect(mobilePresetLabel('standard', t)).toBe('Standard mode')
    expect(mobilePresetLabel('my-agent', t)).toBe('my-agent')
    expect(mobilePresetLabel(undefined, t)).toBe('Not recorded')
  })

  it('renders a right-side mobile drawer rather than taking over Harness details', () => {
    expect(MOBILE_SESSION_INFO_STYLES).toContain('width:44px;height:44px')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('.dllm-session-info-glyph')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('button>svg{width:16px;height:16px}')
    expect(MOBILE_SESSION_INFO_STYLES).not.toContain('button>svg{width:16px;height:16px;fill:none')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('justify-content:flex-end')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('width:var(--dllm-side-drawer-width)')
    expect(MOBILE_SESSION_INFO_STYLES).not.toContain('width:min(88vw,380px)')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('.dllm-context-ring')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('.dllm-context-breakdown-bar')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('--meter-tint:#a78bfa')
    expect(MOBILE_SESSION_INFO_STYLES).not.toContain("name:'details'")
  })

  it('keeps the drawer backdrop full-viewport despite the compact Harness button size', () => {
    expect(MOBILE_SESSION_INFO_STYLES).toContain('.dllm-session-info-backdrop{position:absolute;inset:0;width:auto;height:auto;min-height:0')
  })

  it('uses the shared Local Link hairline for drawer borders and separators', () => {
    expect(MOBILE_SESSION_INFO_STYLES).toContain('border-left:var(--dsh-local-link-border-width) solid')
    expect(MOBILE_SESSION_INFO_STYLES).toContain('border-bottom:var(--dsh-local-link-border-width) solid')
  })

  it('keeps the real Session Log action in the drawer and removes the mistaken lock copy', () => {
    expect(MOBILE_SESSION_INFO_STYLES).toContain('.dllm-session-log-download')
    expect(MOBILE_SESSION_INFO_STYLES).not.toContain('sessionLock')
  })
})
