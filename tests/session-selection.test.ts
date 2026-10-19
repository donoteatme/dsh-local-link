import { describe, expect, it } from 'vitest'
import { CurrentSessionTracker } from '../src/session-selection.js'

describe('invitation Session selection', () => {
  it('tracks the rendered Session without reading catalog current selection', () => {
    const tracker = new CurrentSessionTracker()
    expect(tracker.getCurrent()).toBeUndefined()
    const dispose = tracker.observe('session-a')
    expect(tracker.getCurrent()).toBe('session-a')
    dispose()
    expect(tracker.getCurrent()).toBeUndefined()
  })

  it('does not let a stale scope cleanup erase the newly selected Session', () => {
    const tracker = new CurrentSessionTracker()
    const oldScope = tracker.observe('session-a')
    tracker.observe('session-b')
    oldScope()
    expect(tracker.getCurrent()).toBe('session-b')
  })

  it('keeps a remounted same-identity scope until its own cleanup', () => {
    const tracker = new CurrentSessionTracker()
    const oldScope = tracker.observe('session-a')
    const newScope = tracker.observe('session-a')
    oldScope()
    expect(tracker.getCurrent()).toBe('session-a')
    newScope()
    expect(tracker.getCurrent()).toBeUndefined()
  })
})
