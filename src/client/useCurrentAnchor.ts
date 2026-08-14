/**
 * useCurrentAnchor: tracks which user-question "segment" the conversation
 * viewport's BOTTOM edge currently sits in, so the rail can light the
 * corresponding dot.
 *
 * A segment is one question plus everything after it (its AI answer) up to
 * the next question — the viewport bottom stays inside the last segment
 * while scrolling until that whole question+answer has scrolled past, then
 * the highlight moves up to the previous question. At the bottom of a
 * conversation the newest question's dot is lit by default.
 *
 * Resolves the harness DOM shape (`[data-conversation-scroll]` containing
 * `[data-chat-anchor-key]` rows), filters to the user rows (the passed
 * marks' keys), and picks the LAST user row whose top is still at/above the
 * scrollport's bottom edge. Recomputes on scrollport `scroll` events; when
 * `IntersectionObserver` exists the user rows are also observed (root =
 * scrollport, threshold 0) so layout changes that move a row across the
 * bottom edge without a scroll event still refresh.
 *
 * Pure observation: no timers, no polling; geometry is read only on events.
 *
 * @param order - the ordered chat node keys; a change re-resolves the DOM
 *   rows (new messages appended, load-older prepends, ...).
 * @param marks - the user-question marks; their keys select the user rows.
 * @returns the anchor key of the question whose segment the viewport bottom
 *   is in, or undefined when no user row has reached the bottom edge yet.
 */
import { useEffect, useState } from 'react'

/** Minimal shape of the rail's user marks (only `key` is read here). */
interface MarkLike {
  readonly key: string
}

export function useCurrentAnchor(order: readonly string[], marks: readonly MarkLike[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(undefined)

  useEffect(() => {
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) {
      setCurrent(undefined)
      return
    }
    const userKeys = new Set(marks.map(m => m.key))
    const rows = [...scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
      .filter(row => userKeys.has(row.dataset.chatAnchorKey ?? ''))

    const compute = (): void => {
      const bottom = scrollport.getBoundingClientRect().bottom
      let found: string | undefined
      // Rows ascend in document order; the last row whose top is still at or
      // above the viewport bottom owns the current segment.
      for (const row of rows) {
        if (row.getBoundingClientRect().top <= bottom) {
          found = row.dataset.chatAnchorKey ?? undefined
        } else {
          break
        }
      }
      setCurrent(found)
    }

    compute()
    scrollport.addEventListener('scroll', compute, { passive: true })
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(compute, { root: scrollport, threshold: [0] })
      for (const row of rows) observer.observe(row)
      return () => {
        observer.disconnect()
        scrollport.removeEventListener('scroll', compute)
      }
    }
    return () => {
      scrollport.removeEventListener('scroll', compute)
    }
  }, [order, marks])

  return current
}
