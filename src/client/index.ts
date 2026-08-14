/**
 * dsh-timeline, browser half. Two registrations:
 *   1. TimelineOverlay into the frame-wide `shell.overlay` seat (root scope),
 *      declaring a session-scoped child `timeline.rail`.
 *   2. TimelineRail into that child seat (session scope), where it reads the
 *      conversation snapshot through the standard `useSession` hook.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Establishes the module reference the SlotMap declaration merge below extends.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Pulls ui-layout's SlotMap declaration for `shell.overlay` (kind: 'list',
// scope: 'root') and ui-conversation's session snapshot types into this
// compilation; without them the keys are not members of SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TimelineOverlay } from './TimelineOverlay.tsx'
import { TimelineRail } from './TimelineRail.tsx'
import { createLoadOlder } from './railInject.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * dsh-timeline's session-scoped rail seat, declared by our own
     * `shell.overlay` entry so the overlay can render a per-session rail
     * through the framework SessionProvider.
     */
    'timeline.rail': { kind: 'single'; scope: 'session' }
  }
}

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions']

/**
 * Register the overlay and rail once their slot declarations are on the
 * ledger. The overlay registers directly against the shipped shell.overlay
 * declaration; the rail registers against our own child declaration, which
 * appears exactly when the overlay entry mounts.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'timeline',
      order: 100,
      children: { 'timeline.rail': { kind: 'single', scope: 'session' } },
    },
    TimelineOverlay,
  ))
  ctx.slots.inject('timeline.rail', () => ctx.slots.register(
    {
      name: 'timeline.rail',
      // Session-scoped inject face: the rail receives a binding-safe
      // `loadOlder` action for its own session, used to auto-paginate the
      // history window so dots cover the whole conversation.
      inject: (sessionId) => ({
        loadOlder: createLoadOlder(ctx.sessions, sessionId),
      }),
    },
    TimelineRail,
  ))
}
