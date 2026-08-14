/**
 * TimelineOverlay: the shell.overlay entry (root scope). It declares the
 * session-scoped `timeline.rail` child, so the framework hands it the
 * `SessionProvider` seat. It then renders the rail inside that session area:
 * no session, no rail.
 */
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export type TimelineOverlayProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'timeline.rail'>

/**
 * @param props - runtime share (root kit) + the narrowed renderSlot and the
 *   framework-injected SessionProvider for the session child seat.
 */
export function TimelineOverlay({ SessionProvider, renderSlot }: TimelineOverlayProps) {
  return (
    <SessionProvider empty={() => null}>
      {() => renderSlot('timeline.rail', {})}
    </SessionProvider>
  )
}
