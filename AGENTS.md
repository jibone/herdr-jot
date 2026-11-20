# herdr-jot

A **herdr-app mod** (plugin): a small JavaScript panel that runs inside the
Herdr desktop app. This repo is the mod's source; the running app only reads
mods from its own home folder.

## First, always

**Before any task in this repo, read `~/.config/herdr-app/AGENTS.md`.**

The Herdr app writes that guide itself and rewrites it on every start, so it
always matches the installed version. It is the source of truth for mods:
the gpui-kit way of drawing UI, the `herdr` module (`props`, `run`,
`openOverlay`, `shared`, `exec`, …), the mod folder format (`main.js`,
`mod.json`), layouts, keys, commands, and the `herdr-app` CLI. If that guide
and this file disagree, that guide wins. Re-read it every session — never
work from memory of it — and never edit it or the `.d.ts` files beside it;
the app rewrites those.

## The mod

- Written in **gpui-kit**: JavaScript that describes native GPUI elements
  (`div()`, flex, `.on_click`). No HTML, CSS, DOM, web view, Node APIs or
  `setTimeout` (use `cx.timer` / `cx.spawn`).
- The types are the truth: `gpui-kit.d.ts` (elements) and `herdr.d.ts`
  (app data and commands), both in `~/.config/herdr-app/`.
- One mod per idea. Don't edit Herdr's own shipped mods or layouts —
  clone them (`herdr-app do mod.clone '{"name":"...","as":"..."}'`)
  if you need a starting point.

## The pad as a file (for coding agents)

The jot is a plain UTF-8 text file on this machine:

```
~/.config/herdr-app/data/jot/jot.txt
```

When the person says "jot it down" (or "note it down in the jot"), they
mean: append a short note to that file. When they say "refer to the jot",
they mean: read it. The pad watches the file, so the note shows in the open
pad within a moment (also while its pane is closed — it's there on the next
open).

- Append only: don't rewrite the whole file for one note.
- Keep it small — the pad reads with a 1 MiB cap — and plain text.
- Re-read right before writing; if the person is typing in the pad at that
  same moment, their text wins and yours is dropped, so re-check after your
  write while they're mid-edit.

The path is machine-local (`appHome()`), so this is per-machine. This file
only reaches agents working inside this repo: for the convention to work
from the person's other projects, the path has to be in the coding agent's
own global instructions (opencode: `~/.config/opencode/AGENTS.md`; any other
agent: its equivalent — see RECIPE.md's Watch out).

## Layout

A herdr.dev-style package: a layout integration plus the mods it needs.

```
layouts/main-copy.json   this machine's daily layout (a personal clone of Herdr's
                         shipped main): its tabs block points at tabs-jot,
                         and its work-body carries the hidden right-side
                         "jot" block the pill toggles. On another machine,
                         graft those two edits onto any main-derived layout
                         instead of using this file as-is.
mods/jot/                the pad: main.js, mod.json, icon.svg, and test/
                         (unit tests over host stand-ins — not installed).
                         The text lives in data/jot/jot.txt in the app home.
mods/tabs-jot/           a fork of Herdr's shipped tabs mod: the "Jot"
                         pill after Files/Changes and per-space open memory.
                         Frozen at the version it was forked from.
test/quality/, tools/    the quality gate npm test runs after the mod's tests
assets/                  the hero image, its source (src/hero.html), and the real
                         window screenshot the mockup embeds (screenshot.png)
.github/workflows/       CI: npm test on Linux and macOS, one workflow each
RECIPE.md                the brief to rebuild all of this from scratch
preview.png              a mockup of the pad with sample notes (from assets/src/hero.html)
keys.json                the section to merge into the app home's keys.json
```

Both mods are `"place": "none"` — a layout's blocks put them on screen; Herdr
docks nothing on its own.

## Developing

1. The app only reads its own home, and doesn't hot-reload a symlinked mod.
   To test, copy the mods there (test folders are dev-only and stay out):
   `rsync -a --delete --exclude test --exclude gpui-kit.d.ts --exclude herdr.d.ts --exclude jsconfig.json mods/jot/ ~/.config/herdr-app/mods/jot/`
   (the same for `mods/tabs-jot/`), plus
   `rsync -a layouts/ ~/.config/herdr-app/layouts/`, then merge `keys.json`
   by hand (below).
2. Saving a file hot-reloads every copy in the window; a broken save keeps
   the old version running and shows in `herdr-app status`.
3. After every change: `herdr-app check ~/.config/herdr-app/mods/<name>` for
   each mod. It exits nonzero with the exact error. Never call a mod done
   without a passing check — and trying it in the app.
4. `npm ci && npm test` runs the jot mod's tests and the quality gate.
   Node 24 or newer (`.nvmrc`, `engines`): the tests need
   `module.registerHooks`.
5. `herdr-app shot [file.png]` saves the current window frame when debugging
   the drawn UI.

### Code

- Comments are allowed in this repo, unlike herdr-limits: the fork keeps
  Herdr's own comments, and jot's say why the tricky parts are the way
  they are. RECIPE.md's Watch out carries the platform reasons regardless.
- `npm test` runs the mod's tests, then the quality gate in `test/quality/`:
  eslint (size and complexity limits on the code we own, the one class per
  mod, no eslint-disable escapes, no shadowing), jscpd (no copied code),
  and the probes that keep both honest.
- The tabs-jot fork is held to base and style rules only, and never edited
  to satisfy a rule — it's Herdr's shipped code, frozen; a rule it breaks
  joins the exemption block in `eslint.config.js` (or `.jscpd.json`'s
  ignore) instead.
- CI runs the same `npm test` (`.github/workflows/tests.yml`) on Linux and
  macOS, one workflow each (`linux.yml`, `macos.yml`, so each has its README
  badge), for every pull request and every push to `master`; a pull request
  merges only when both pass.

## Sharing (herdr.dev/mods)

- Write the `RECIPE.md` from the real files, keep `preview.png` current, put
  this folder in a public GitHub repo and add the topic `herdr-mod`; it
  shows up at herdr.dev/mods within the hour.
- `assets/hero.png` (the README's top image, 1760×1080) and `preview.png`
  (the gallery card, 1400×859) are rendered from one mockup,
  `assets/src/hero.html` (880×540, headless Chrome at 2× and 1.591×):
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  --headless=new --hide-scrollbars --screenshot=<out> --window-size=880,540
  --force-device-scale-factor=<2 | 1.591> "file://…/assets/src/hero.html"`.
  Change the mockup, not the PNGs; re-render both after. The mockup's right
  side embeds the real window screenshot, committed as
  `assets/screenshot.png` — replace it only with another real
  `herdr-app shot`, never with a render.
- The repo's layout file is this machine's personal integration (it
  references other mods the person has installed); `RECIPE.md` describes the
  two grafts that install the plugin on any main-derived layout.
- A `keys.json` here is never installed directly: merge its sections into
  the app home's `keys.json`, and ask before replacing a key already in use.
