/**
 * Binding-safe `loadOlder` action for the timeline rail.
 *
 * Decoupled from any harness runtime value so tsdown can bundle `lib/client.js`
 * without importing the sessions service. The structural `SessionsLike` matches
 * the runtime `ISessions` face: `ctx.sessions.binding(id)` returns a
 * `SessionBinding | undefined`, and the binding's `session.loadOlder()` pulls
 * one earlier history page (harness `PAGE_MESSAGES = 50` events per page).
 */

/** Structural sessions-service face — mirrors the harness `ISessions` contract for `binding`. */
export interface SessionsLike {
  binding(id: string): { session: { loadOlder(): Promise<unknown> } } | undefined
}

/**
 * Wrap a session-bound `loadOlder` call into a safe action closure.
 *
 * - Missing binding: resolves (never throws on an unlisted/unscoped session).
 * - Bound session: delegates to `session.loadOlder()`; a rejection propagates
 *   unchanged so callers can surface the transport error.
 *
 * @param sessions - the injected sessions service (`ctx.sessions`).
 * @param sessionId - the session the rail is scoped to.
 * @returns an action that loads the previous message page for that session.
 */
export function createLoadOlder(sessions: SessionsLike, sessionId: string): () => Promise<void> {
  return async () => {
    const binding = sessions.binding(sessionId)
    if (binding === undefined) return
    await binding.session.loadOlder()
  }
}
