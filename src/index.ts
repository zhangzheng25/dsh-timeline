/**
 * dsh-timeline, node half. Empty on purpose: everything this plugin does
 * happens in the browser half — the harness's session snapshot already holds
 * every user message, and jumps are pure DOM work.
 *
 * @module dsh-timeline
 */

/** Plugin configuration (none). */
export interface Config {
  [key: string]: never
}

/** Host capabilities required (none). */
export function apply(_ctx: unknown, _config: Config = {}): void {}
