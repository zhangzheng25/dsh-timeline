/**
 * TimelineRail: a slim vertical bar rail on the right edge of the frame — one
 * bar per user question. Click a bar to smooth-scroll to that message; hover
 * to preview its first 80 characters. That's the whole plugin.
 *
 * Data sources (all from the session-scoped `useSession` snapshot):
 *   - chat.order + chat.nodes.get(key) -> user-message nodes
 *   - node.data.content (ContentBlock[]) -> message text
 *
 * Jump: the harness renders every chat row with a `data-chat-anchor-key`
 * attribute whose value is the node key; `scrollIntoView` lands on it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, MouseEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { dotColor, extractPreview, PREVIEW_LENGTH } from './rail-logic.ts'

/** The rail's session-scoped standard kit plus the injected loadOlder action. */
export type TimelineRailProps = PropsRuntime<'timeline.rail'> & {
  /** Pull one earlier history page (injected, session-bound; harness pages of 50 events). */
  loadOlder?: () => Promise<void>
}

/** One user-question bar. */
interface TimelineMark {
  /** Chat node key — also the row's `data-chat-anchor-key`. */
  readonly key: string
  /** Message sequence number. */
  readonly seq: number
  /** Message timestamp (epoch ms). */
  readonly time: number
  /** Hover preview (first 80 chars). */
  readonly preview: string
}

/**
 * Find a chat row by its node key, avoiding CSS.escape pitfalls on keys that
 * contain `<`/`>`/`:` (the node key is `13:input-message<messageId>`).
 */
function findRow(key: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/**
 * Absolute time label from an epoch-ms timestamp: today's messages show
 * `HH:MM`; anything earlier (yesterday and before) shows `MM/DD HH:MM`.
 */
function formatTime(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  if (sameDay) return `${hh}:${mm}`
  return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`
}

/**
 * Rail container: fixed at the frame's right edge, vertically centred.
 * Click-through: only the bar list below opts back into pointer events.
 * Height-capped so a long conversation cannot overflow the viewport — the
 * bar list inside scrolls instead (bars keep their spacing, never compress).
 */
const railStyle: CSSProperties = {
  position: 'fixed',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '70vh',
  zIndex: 1000,
  // The shell.overlay layer is click-through; only the bar list opts back in.
  pointerEvents: 'none',
}

/** bar list: scrolls internally once it outgrows the rail's height cap. */
const listStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  padding: '10px 4px',
  pointerEvents: 'auto',
}

/**
 * Hover tooltip, portalled onto `document.body` with `position: fixed`.
 *
 * It must NOT live inside the bar list: an `overflow-y: auto` container forces
 * `overflow-x` to auto as well (CSS can't keep one axis visible while the
 * other scrolls), which would clip the tooltip as it pops out to the left.
 * Portalling escapes every ancestor's clipping; `translate(-100%, -50%)`
 * anchors the box to the bar without knowing its width up front.
 */
function tooltipStyle(pos: { readonly x: number; readonly y: number }): CSSProperties {
  return {
    position: 'fixed',
    left: pos.x - 12,
    top: pos.y,
    transform: 'translate(-100%, -50%)',
    zIndex: 2000,
    textAlign: 'left',
    width: 'max-content',
    maxWidth: 260,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    background: '#ffffff',
    color: '#1f2430',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
    lineHeight: 1.5,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
    pointerEvents: 'none',
  }
}

/**
 * @param props - the session-scoped standard kit from the framework, plus the
 *   injected `loadOlder` action (no-op default for renders outside the slot
 *   machinery).
 */
export function TimelineRail({ useSession, loadOlder = async () => {} }: TimelineRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  // F3: the conversation paging window. `hasMore` says older history still
  // sits outside the loaded window; `loadingOlder` gates the page fetch.
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  const [hovered, setHovered] = useState<{ key: string; x: number; y: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Ordered user-question dots. node.kind === 'user' is the append-origin
  // human prompt (steering/context/assistant/tool kinds are skipped).
  const marks = useMemo<TimelineMark[]>(() => {
    const result: TimelineMark[] = []
    for (const key of order) {
      const node = nodes.get(key)
      if (node === undefined || node.kind !== 'user') continue
      const data = node.data as { seq?: number; time?: number; content?: unknown }
      result.push({
        key,
        seq: data.seq ?? 0,
        time: data.time ?? 0,
        preview: extractPreview(data.content),
      })
    }
    return result
  }, [order, nodes])

  // Auto-paginate: keep pulling older pages until the whole conversation is
  // in the window (`hasMore` flips to false). The window only loads the most
  // recent PAGE_MESSAGES (50) events initially, so without this the rail would
  // only cover the tail of a long session. `order` in the deps re-arms the
  // effect after each prepend (and retries if the first call raced the window
  // opening, when loadOlder is internally a no-op).
  useEffect(() => {
    if (hasMore && !loadingOlder) void loadOlder()
  }, [hasMore, loadingOlder, loadOlder, order])

  // While older pages are still being pulled, keep the dot list pinned to the
  // newest marks (bottom). Once pagination finishes (`hasMore` false) the user
  // is free to scroll the list; a later new message no longer yanks the view.
  useEffect(() => {
    const el = listRef.current
    if (el !== null && hasMore) el.scrollTop = el.scrollHeight
  }, [marks.length, hasMore])

  if (marks.length === 0) return null

  /** Jump to the chat row with the given node key. */
  const jump = (key: string): void => {
    const row = findRow(key)
    if (row === null) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hoveredMark = hovered === null ? undefined : marks.find(m => m.key === hovered.key)

  return (
    <div style={railStyle}>
      <div ref={listRef} style={listStyle} role="navigation" aria-label="提问时间线">
        {marks.map((mark, i) => {
        const open = hovered?.key === mark.key
        return (
          <button
            key={mark.key}
            type="button"
            aria-label={mark.preview ? `第 ${i + 1} 条提问：${mark.preview}` : `第 ${i + 1} 条提问`}
            onClick={() => jump(mark.key)}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHovered({ key: mark.key, x: rect.left, y: rect.top + rect.height / 2 })
            }}
            onMouseLeave={() => setHovered(null)}
            onMouseDown={(e: MouseEvent) => e.stopPropagation()}
            style={{
              position: 'relative',
              pointerEvents: 'auto',
              // A perfect circle that STAYS a circle: in a flex column the
              // default flex-shrink would squash the height and turn it into
              // an ellipse; flexShrink 0 pins the 10x10 shape no matter how
              // the window is squeezed.
              width: 10,
              height: 10,
              borderRadius: '50%',
              flexShrink: 0,
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              background: dotColor(i, marks.length),
              // Hover highlight: tight 2px ring in the DSH theme ink
              // (#0F1115) and a modest scale — small footprint, high contrast.
              boxShadow: open ? '0 0 0 2px rgba(15, 17, 21, 0.8)' : 'none',
              transform: open ? 'scale(1.3)' : 'scale(1)',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          />
        )
      })}
      </div>
      {hovered !== null && hoveredMark !== undefined && createPortal(
        <span style={tooltipStyle(hovered)}>
          <span style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            第 {marks.indexOf(hoveredMark) + 1} 条提问 · {formatTime(hoveredMark.time)}
          </span>
          {hoveredMark.preview.length > 0
            ? hoveredMark.preview + (hoveredMark.preview.length >= PREVIEW_LENGTH ? '…' : '')
            : '（空消息）'}
        </span>,
        document.body,
      )}
    </div>
  )
}
