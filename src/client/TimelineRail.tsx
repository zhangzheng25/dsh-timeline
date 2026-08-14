/**
 * TimelineRail: a slim vertical dot rail on the right edge of the frame — one
 * dot per user question. Click a dot to smooth-scroll to that message; hover
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
import { extractPreview, PREVIEW_LENGTH } from './rail-logic.ts'
import { useCurrentAnchor } from './useCurrentAnchor.ts'

/** The rail's session-scoped standard kit plus the injected loadOlder action. */
export type TimelineRailProps = PropsRuntime<'timeline.rail'> & {
  /** Pull one earlier history page (injected, session-bound; harness pages of 50 events). */
  loadOlder?: () => Promise<void>
}

/** One user-question dot. */
interface TimelineMark {
  /** Chat node key — also the row's `data-chat-anchor-key`. */
  readonly key: string
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

/** Dot geometry: 10px dots with roomy 16px gaps. */
const DOT_SIZE = 10
const DOT_GAP = 16
/**
 * Dot colors: plain dots are quiet gray; the highlighted dot (hovered or
 * current segment) turns blue. Deliberately NO scale/ring on highlight — an
 * enlarged dot was the reason edge dots got clipped, so state is carried by
 * color alone and the 10px circle can never touch the list's edges.
 */
const DOT_COLOR = '#B8BEC9'
const DOT_HIGHLIGHT = '#4D75E6'
/**
 * Breathing room above the first and below the last dot. Must be a MARGIN on
 * the edge dots, not container padding: padding scrolls out of view at the
 * extremes, margin lives in the scroll content and stays visible, so the
 * first/last dots are never clipped by the list's edge.
 */
const EDGE_GAP = 16
/**
 * Visible capacity of the rail: at most this many dots at once — anything
 * older scrolls inside the list, keeping the UI calm on long conversations.
 */
const MAX_VISIBLE_DOTS = 15

/**
 * Clearance the follow-scroll keeps between the lit dot and the list edges.
 * Small on purpose: the dot never grows (no ring/scale), so it only needs to
 * stay fully inside the list — generous bands just push neighbours around.
 */
const KEEP_IN_VIEW_PX = 16

/**
 * Rail container: fixed at the frame's right edge, vertically centred.
 * Click-through: only the dot list below opts back into pointer events.
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
  // The shell.overlay layer is click-through; only the dot list opts back in.
  pointerEvents: 'none',
}

/** Dot list: fixed height of MAX_VISIBLE_DOTS dots; older ones scroll inside. */
const listStyle: CSSProperties = {
  // NO `flex: 1` here — its flex-basis: 0% would override `height` and the
  // list would grow to the rail's 70vh cap, showing far more than 15 dots.
  // Default `flex: 0 1 auto` keeps the basis while still shrinking on short
  // viewports (minHeight 0 lets the shrink actually happen).
  minHeight: 0,
  height: MAX_VISIBLE_DOTS * DOT_SIZE + (MAX_VISIBLE_DOTS - 1) * DOT_GAP + EDGE_GAP * 2,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: DOT_GAP,
  padding: '0 4px',
  pointerEvents: 'auto',
}

/**
 * Hover tooltip, portalled onto `document.body` with `position: fixed`.
 *
 * It must NOT live inside the dot list: an `overflow-y: auto` container forces
 * `overflow-x` to auto as well (CSS can't keep one axis visible while the
 * other scrolls), which would clip the tooltip as it pops out to the left.
 * Portalling escapes every ancestor's clipping; `translate(-100%, -50%)`
 * anchors the box to the dot without knowing its width up front.
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
  // `hasMore` says older history still sits outside the loaded window;
  // `loadingOlder` gates the page fetch.
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  const [hovered, setHovered] = useState<{ key: string; x: number; y: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Hide scrollbars entirely — both our dot list's and the conversation
  // page's vertical one (requested: the rail's dots become the position
  // indicator, so the page needs no visible track). `scrollbar-width` is
  // honored by Firefox (and newer Chromium), the WebKit pseudo-element
  // covers the rest. Scrolling itself is untouched: wheel, keyboard and
  // touch still scroll normally, there is just no visible scrollbar.
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = [
      '[data-timeline-list]{scrollbar-width:none}[data-timeline-list]::-webkit-scrollbar{display:none;width:0;height:0}',
      '[data-conversation-scroll]{scrollbar-width:none}[data-conversation-scroll]::-webkit-scrollbar{display:none;width:0;height:0}',
    ].join('')
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  // Ordered user-question dots. node.kind === 'user' is the append-origin
  // human prompt (steering/context/assistant/tool kinds are skipped).
  const marks = useMemo<TimelineMark[]>(() => {
    const result: TimelineMark[] = []
    for (const key of order) {
      const node = nodes.get(key)
      if (node === undefined || node.kind !== 'user') continue
      const data = node.data as { time?: number; content?: unknown }
      result.push({
        key,
        time: data.time ?? 0,
        preview: extractPreview(data.content),
      })
    }
    return result
  }, [order, nodes])

  // The question whose segment (question + its answer, up to the next
  // question) the viewport bottom is currently inside — its dot stays lit
  // while the user scrolls, moving up only once that whole segment has
  // scrolled past the bottom edge. At the conversation's bottom the newest
  // question's dot is lit by default.
  const currentKey = useCurrentAnchor(order, marks)

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

  // Keep the lit dot inside a safe band: when the current segment changes
  // (chat scroll), nudge the list ONLY when the dot is about to leave the
  // viewport — KEEP_IN_VIEW_PX of clearance on either side. A dot already
  // inside the band is left alone, so the highlight does not chase the middle
  // and manual list browsing is not yanked around.
  useEffect(() => {
    if (currentKey === undefined) return
    const el = listRef.current
    if (el === null) return
    let dot: HTMLElement | null = null
    for (const row of el.querySelectorAll<HTMLElement>('[data-dot-key]')) {
      if (row.dataset.dotKey === currentKey) {
        dot = row
        break
      }
    }
    if (dot === null) return
    const elRect = el.getBoundingClientRect()
    const dotRect = dot.getBoundingClientRect()
    // Dot position in content coordinates.
    const relTop = dotRect.top - elRect.top + el.scrollTop
    const relBottom = relTop + DOT_SIZE
    const bandTop = el.scrollTop + KEEP_IN_VIEW_PX
    const bandBottom = el.scrollTop + el.clientHeight - KEEP_IN_VIEW_PX
    let target: number | null = null
    if (relTop < bandTop) {
      target = el.scrollTop - (bandTop - relTop)
    } else if (relBottom > bandBottom) {
      target = el.scrollTop + (relBottom - bandBottom)
    }
    if (target !== null) {
      el.scrollTop = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight))
    }
  }, [currentKey])

  if (marks.length === 0) return null

  /** Jump to the chat row with the given node key. */
  const jump = (key: string): void => {
    const row = findRow(key)
    if (row === null) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hoveredIndex = hovered === null ? -1 : marks.findIndex(m => m.key === hovered.key)
  const hoveredMark = hoveredIndex >= 0 ? marks[hoveredIndex] : undefined

  return (
    <div style={railStyle}>
      <div ref={listRef} data-timeline-list style={listStyle} role="navigation" aria-label="提问时间线">
        {marks.map((mark, i) => {
          const isHovered = hovered?.key === mark.key
          // Current-position highlight: the dot of the question whose segment
          // (question + answer) the viewport bottom is in.
          const isCurrent = !isHovered && currentKey === mark.key
          const lit = isHovered || isCurrent
          return (
            <button
              key={mark.key}
              type="button"
              data-dot-key={mark.key}
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
                // Edge dots carry the breathing room so the list's extremes
                // never clip them (see EDGE_GAP).
                marginTop: i === 0 ? EDGE_GAP : 0,
                marginBottom: i === marks.length - 1 ? EDGE_GAP : 0,
                // A perfect circle that STAYS a circle: in a flex column the
                // default flex-shrink would squash the height and turn it into
                // an ellipse; flexShrink 0 pins the shape no matter how the
                // window is squeezed.
                width: DOT_SIZE,
                height: DOT_SIZE,
                borderRadius: '50%',
                flexShrink: 0,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                // State is carried by color alone: gray at rest, blue when
                // hovered or current. No ring, no scale — the dot never grows
                // beyond its 10px box, so nothing can ever be clipped.
                background: lit ? DOT_HIGHLIGHT : DOT_COLOR,
              }}
            />
          )
        })}
      </div>
      {hovered !== null && hoveredMark !== undefined && createPortal(
        <span style={tooltipStyle(hovered)}>
          <span style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            第 {hoveredIndex + 1} 条提问 · {formatTime(hoveredMark.time)}
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
