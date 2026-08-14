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
import { useMemo, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { dotColor, extractPreview, PREVIEW_LENGTH } from './rail-logic.ts'

/** The rail's session-scoped standard kit (useSession is framework-injected). */
export type TimelineRailProps = PropsRuntime<'timeline.rail'>

/** One user-question dot. */
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

/** Rail container: fixed at the frame's right edge, vertically centred. */
const railStyle: CSSProperties = {
  position: 'fixed',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  padding: '10px 4px',
  zIndex: 1000,
  // The shell.overlay layer is click-through; only the dots opt back in.
  pointerEvents: 'none',
}

/** Hover tooltip: floats to the left of its dot. */
function tooltipStyle(open: boolean): CSSProperties {
  return {
    position: 'absolute',
    right: 'calc(100% + 12px)',
    top: '50%',
    transform: 'translateY(-50%)',
    // Browsers UA-style buttons with text-align: center; the tooltip span
    // inherits it — pin left alignment explicitly.
    textAlign: 'left',
    // Shrink-to-fit with only `right` set measures from the button's static
    // position (viewport right edge) and gets ~0px — hence one char per line.
    // `max-content` lets the text lay out horizontally, capped at maxWidth.
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
    opacity: open ? 1 : 0,
    transition: 'opacity 120ms ease',
  }
}

/**
 * @param props - the session-scoped standard kit from the framework.
 */
export function TimelineRail({ useSession }: TimelineRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

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

  if (marks.length === 0) return null

  /** Jump to the chat row with the given node key. */
  const jump = (key: string): void => {
    const row = findRow(key)
    if (row === null) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={railStyle} role="navigation" aria-label="提问时间线">
      {marks.map((mark, i) => {
        const open = hoveredKey === mark.key
        return (
          <button
            key={mark.key}
            type="button"
            aria-label={mark.preview ? `第 ${i + 1} 条提问：${mark.preview}` : `第 ${i + 1} 条提问`}
            onClick={() => jump(mark.key)}
            onMouseEnter={() => setHoveredKey(mark.key)}
            onMouseLeave={() => setHoveredKey(null)}
            style={{
              position: 'relative',
              pointerEvents: 'auto',
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              background: dotColor(i, marks.length),
              boxShadow: open ? '0 0 0 3px rgba(218, 228, 255, 0.55)' : 'none',
              transform: open ? 'scale(1.35)' : 'scale(1)',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
            onMouseDown={(e: MouseEvent) => e.stopPropagation()}
          >
            <span style={tooltipStyle(open)}>
              <span style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                第 {i + 1} 条提问 · {formatTime(mark.time)}
              </span>
              {mark.preview.length > 0
                ? mark.preview + (mark.preview.length >= PREVIEW_LENGTH ? '…' : '')
                : '（空消息）'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
