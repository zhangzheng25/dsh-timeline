#!/usr/bin/env node
/**
 * Sync the built plugin artifacts into the DSH profile's plugin copy.
 *
 * When dsh-timeline is installed remotely (`dsh plugin add ...` on a machine
 * other than the dev one), DSH loads the plugin from a COPY inside the
 * profile — <DSH_HOME>/profiles/<profile>/node_modules/dsh-timeline — NOT
 * from this checkout. Edits here never reach that copy, so after every
 * `pnpm run build` run `pnpm run sync:dsh` to push the artifacts over.
 *
 * Environment:
 *   DSH_HOME    - DSH data home (default: ~/.dsh)
 *   DSH_PROFILE - profile name (default: web)
 *
 * Exit code 1 with a message when the plugin copy is not found — that
 * usually means the plugin was installed into a different profile.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profile = process.env.DSH_PROFILE || 'web'
const pluginName = pkg.name
const dst = join(dshHome, 'profiles', profile, 'node_modules', pluginName)

if (!existsSync(dst)) {
  console.error(
    `[sync-dsh] plugin copy not found: ${dst}\n` +
    `  The plugin may be installed into another profile (set DSH_PROFILE) or\n` +
    `  not installed at all. Nothing was synced.`,
  )
  process.exit(1)
}

/** Artifacts to copy; `package.json`'s `files` field plus the READMEs. */
const files = [
  'lib/index.js',
  'lib/client.js',
  'lib/client.js.map',
  'cordis.patch.yml',
  'README.md',
  'README.en.md',
]

if (!existsSync(join(root, 'lib', 'client.js'))) {
  console.error('[sync-dsh] lib/client.js is missing — run `pnpm run build` first.')
  process.exit(1)
}

let copied = 0
for (const file of files) {
  const src = join(root, file)
  if (!existsSync(src)) continue
  const target = join(dst, file)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(src, target)
  copied += 1
}

console.log(`[sync-dsh] synced ${copied} file(s) -> ${dst}`)
