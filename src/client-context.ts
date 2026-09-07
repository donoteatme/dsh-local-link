import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

/** Browser-side Cordis context after the DSH 0.1.2 client services activate. */
export type ClientContext = Omit<Context, 'sessions'> & {
  readonly sessions: ISessions
}
