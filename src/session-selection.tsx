import React, { useLayoutEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClientContext } from './client-context.js'

/** Selection belongs to the rendered Session scope, not the Host catalog. */
export class CurrentSessionTracker {
  private current: string | undefined
  private owner: symbol | undefined

  getCurrent = (): string | undefined => this.current

  observe(sessionId: string): () => void {
    const owner = Symbol('session scope')
    this.owner = owner
    this.current = sessionId
    return () => {
      if (this.owner !== owner) return
      this.owner = undefined
      this.current = undefined
    }
  }
}

function SessionObserver({ sessionId, tracker }: PropsRuntime<'conversation.input.dock'> & {
  readonly tracker: CurrentSessionTracker
}): null {
  useLayoutEffect(() => tracker.observe(sessionId), [tracker, sessionId])
  return null
}

export function trackCurrentSession(ctx: ClientContext, tracker: CurrentSessionTracker): () => void {
  return ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-local-link.current-session',
    order: -110,
  }, props => <SessionObserver {...props} tracker={tracker} />))
}
