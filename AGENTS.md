# AGENTS.md — dsh-timeline

A DeepSeek Harness (DSH) web plugin: a slim dot rail on the right edge of the
conversation — one dot per user question, click to jump, hover to preview.
Everything runs in the browser half; the node half (`src/index.ts`) is an
empty `apply` and should stay that way unless a real host-side need appears.

## Commands

```sh
pnpm install          # first time (workspace yaml already relaxes minimumReleaseAge)
pnpm run typecheck    # tsc --noEmit
pnpm run build        # tsdown → lib/index.js (node, ESM) + lib/client.js (browser, CJS)
pnpm run sync:dsh     # push built artifacts into a remote-installed profile copy (see below)
```

There is no test suite. Verification is `typecheck` + `build`.

## Build artifacts are committed

`lib/` (including `client.js.map`) is checked into git and is what DSH
actually loads. After any `src/client/` change you MUST run `pnpm run build`
and commit the updated `lib/client.js` + map together with the source — the
plugin ships to end users via the repo, and stale `lib/` means users run old
code.

## How edits reach a running DSH (verified)

- **Client code** (`src/client/` → `lib/client.js`): DSH serves
  `/plugins/dsh-timeline/client.js` straight from disk with `no-cache`, so
  build + **refresh the page** is enough. No restart.
- **Host half** (`src/index.ts`) or `cordis.patch.yml`: loaded at startup —
  a DSH **restart** is required.

## Local development install (critical)

Install into a profile with the **`link:` protocol** — never `file:`:

```sh
dsh plugin --profile web add link:D:/deepseek-harness/plugin/dsh-timeline
```

`file:` copies the directory under the profile's hoisted nodeLinker, so local
edits never reach DSH; `link:` creates a junction to this checkout that stays
live. Do NOT re-run remote installs (`add github:...`) or the junction is
replaced by a copy. Verify with `Get-Item ...\node_modules\dsh-timeline`
(expect `LinkType: Junction`).

If the plugin was remote-installed (copy mode, e.g. another machine), DSH
loads `$DSH_HOME/profiles/<profile>/node_modules/dsh-timeline` — a copy — and
local edits have no effect until you run `pnpm run sync:dsh` (honors
`DSH_HOME` / `DSH_PROFILE`).

## Theming (do not hardcode colors)

- DSH defines design tokens on `body` (`--dsw-alias-*`, `--dsw-static-*`),
  re-mapped by `body[data-ds-dark-theme]`. Dot colors reference them with
  literal fallbacks, e.g. `var(--dsw-alias-state-business-primary, #4D75E6)`.
- The tooltip's surface colors (background / text / border / divider) must
  live in the **injected stylesheet** (the same `<style>` that hides
  scrollbars), NOT inline styles: inline styles beat any stylesheet rule, so
  `body[data-ds-dark-theme] [data-timeline-tooltip] { ... }` could never
  override them. Light = paper-white tokens; dark = near-black
  `--dsw-static-neutral-bluish-1000` + white copy.
- Secondary copy uses `--dsw-alias-label-tertiary` (meta/sub tier), matching
  dsh-token-monitor's layering.

## UI constraints (all are load-bearing)

- Tooltip is portalled to `document.body`: an `overflow-y: auto` ancestor
  clips absolute children, and the rail's list is such a container.
- Dots are `flexShrink: 0` (a flex column would squash the circle) and never
  scale/ring on highlight — state is carried by color alone so edge dots can
  never be clipped.
- Jump/scroll glue depends on harness DOM: rows carry `data-chat-anchor-key`
  (find rows by iterating + comparing, not `CSS.escape` — keys contain `:`
  and `<`), the scrollport is `[data-conversation-scroll]`.
- `useCurrentAnchor` computes the active segment from viewport geometry only;
  keep it event-driven (scroll + IntersectionObserver), no timers.

## Architecture

- `src/client/index.ts` registers `TimelineOverlay` into `shell.overlay`
  (root scope, click-through) which declares a session-scoped child seat
  `timeline.rail`; `TimelineRail` reads the conversation via `useSession`
  (chat.order + chat.nodes, `kind === 'user'`).
- `package.json` `dsh.client.inject` lists the runtime packages the web
  loader must provide — update it if the bundle starts importing new platform
  modules, and keep `tsdown.config.ts` externals in sync with them.
- Copy is Chinese-only by design (no i18n). Comments are English.

## Git conventions

Conventional commits (`feat:` / `style:` / `chore:` / `docs:` / `refactor:`),
single-line summary + body. `lib/` and READMEs travel with the change they
belong to. Commit identity is repo-local (`zhangzheng25 <184792285@qq.com>`).
