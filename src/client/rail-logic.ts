/**
 * Pure rail logic: message text extraction, hover preview, and bar coloring.
 * Side-effect free so the rail component can consume it directly.
 */

/** One text content block inside a user message's ContentBlock[] payload. */
interface TextBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * Extract the plain text of a ContentBlock[] payload: the `text` of every
 * `{ type: 'text', text: string }` block, joined with a single space and
 * trimmed.
 * @param content - untrusted payload; anything that is not an array yields ''.
 */
export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join(' ').trim()
}

/** Length of the hover preview, in characters. */
export const PREVIEW_LENGTH = 80

/**
 * First {@link PREVIEW_LENGTH} characters of a message, for the hover preview.
 * @param content - a ContentBlock[] payload.
 */
export function extractPreview(content: unknown): string {
  return extractText(content).slice(0, PREVIEW_LENGTH)
}

/**
 * Dot color: blue gradient, like a Git commit graph. Newest (highest index)
 * is the deepest tone `#4D75E6` (hsl lightness 45%), fading to a light blue
 * at 72% lightness for the oldest.
 * @param index - dot position in the rail (0 = oldest).
 * @param total - number of dots.
 */
export function dotColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1)
  const lightness = 72 - t * 27 // 72% -> 45%
  return `hsl(218, 88%, ${lightness}%)`
}
