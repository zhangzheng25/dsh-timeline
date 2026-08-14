# dsh-timeline

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> | <strong>English</strong>
</p>

A minimal **question timeline** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): One bar per question you asked, right on the edge of the frame. Click a bar to jump straight to that message; hover to preview what you said and when.

![Question timeline in action](ScreenShot.png)

No configuration, no host dependencies, no database — everything comes from the conversation snapshot already in your browser.

## Features

- 🎯 **One bar per question** — every user message gets a horizontal bar in a slim rail on the right edge of the frame
- 📜 **Full-history rail** — long conversations auto-paginate (`loadOlder`) until *every* question in the session has a bar, not just the most recent page
- 📏 **Never overflows** — the rail caps at 70% of the viewport height; once the bars outgrow it the list scrolls with the wheel (hidden scrollbar), and bars keep their spacing instead of compressing
- ⚡ **Click to jump** — smooth-scrolls the conversation to the exact message
- 👁 **Hover to preview** — shows the message number, the time it was asked, and the first 80 characters of what you said
- 🕐 **Absolute time** — today's messages show `HH:MM`; anything earlier shows `MM/DD HH:MM`
- 🎨 **Git-commit gradient** — newest bar is deepest blue, oldest is lightest, so recency reads at a glance
- 🖱 **Click-through rail** — the rail never blocks the conversation; only the bars capture clicks
- 📦 **Zero-footprint host** — the node half is an empty `apply`; nothing runs server-side
- 🔤 **No i18n bloat** — copy is Chinese-only by design (keep it small)

## Install

```sh
dsh plugin --profile web add github:zhangzheng25/dsh-timeline
```

Restart DSH, open any conversation with at least one question, and the rail appears on the right.

To develop locally instead:

```sh
dsh plugin --profile web add E:\path\to\dsh-timeline   # junction-linked, edits apply after rebuild + restart
```

## How it works

```
shell.overlay (root scope, additive, click-through)
  └─ timeline.rail (self-declared child slot, session scope)
       └─ useSession snapshot → chat.order + chat.nodes (kind === 'user')
            → bars → data-chat-anchor-key rows → scrollIntoView
```

- **Injection point**: the frame-wide `shell.overlay` seat declares our own session-scoped child slot `timeline.rail`; the overlay bridges into the current session via the framework's `SessionProvider`.
- **Data**: user messages come from the `useSession` snapshot (`chat.order` / `chat.nodes`), including the message timestamp (`data.time`) — no session logs, no database.
- **Jump**: every chat row carries a `data-chat-anchor-key` attribute whose value is the node key; clicking a bar finds that row and `scrollIntoView`s it.
- **UI**: the rail is `position: fixed` with `pointer-events: none`; only the bars opt back in, so the conversation underneath stays fully usable.

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsdown → lib/index.js (host) + lib/client.js (browser)
```

Build artifacts (`lib/`) are committed, so end users don't need to build. After changing source: `pnpm run build`, then restart DSH (or just refresh the page for pure client changes).

## Tech notes

- TypeScript + [tsdown](https://github.com/rolldown/tsdown), following the official `clientBundle` preset shape
- Slot declarations come in via type-only imports (`@deepseek-ai/dsh-client-ui-layout/client`, `@deepseek-ai/dsh-client-ui-conversation/client`)
- `dsh.client.inject` lists the runtime packages the web loader must provide
- The tooltip text is left-aligned explicitly (buttons UA-default to `text-align: center`), and sized with `width: max-content` so absolute positioning can't collapse it to one character per line

## Credits

Slimmed-down rework of [dsh-milestone](https://github.com/SnowCrescenter-tech/dsh-milestone) by SnowCrescenter-tech — kept only the bars, the jump, and the hover preview.

## License

MIT
