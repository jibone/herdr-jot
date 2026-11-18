# herdr-scratchpad

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

## Layout

A herdr.dev-style package: a layout integration plus the mods it needs.

```
layouts/main-copy.json   this machine's daily layout (a personal clone of Herdr's
                         shipped main): its tabs block points at tabs-scratchpad,
                         and its work-body carries the hidden right-side
                         "scratchpad" block the pill toggles. On another machine,
                         graft those two edits onto any main-derived layout
                         instead of using this file as-is.
mods/scratchpad/         the pad: main.js, mod.json, icon.svg. The text lives in
                         data/scratchpad/scratchpad.txt in the app home.
mods/tabs-scratchpad/    a fork of Herdr's shipped tabs mod: the "Scratchpad"
                         pill after Files/Changes and per-space open memory.
                         Frozen at the version it was forked from.
RECIPE.md                the brief to rebuild all of this from scratch
preview.png              a screenshot of it running
keys.json                the section to merge into the app home's keys.json
```

Both mods are `"place": "none"` — a layout's blocks put them on screen; Herdr
docks nothing on its own.

## Developing

1. The app only reads its own home. To test, copy this repo's pieces there:
   `rsync -a mods/ ~/.config/herdr-app/mods/` and
   `rsync -a layouts/ ~/.config/herdr-app/layouts/`, then merge `keys.json`
   by hand (below).
2. Saving a file hot-reloads every copy in the window; a broken save keeps
   the old version running and shows in `herdr-app status`.
3. After every change: `herdr-app check ~/.config/herdr-app/mods/<name>` for
   each mod. It exits nonzero with the exact error. Never call a mod done
   without a passing check — and trying it in the app.
4. `herdr-app shot [file.png]` saves the current window frame when debugging
   the drawn UI.

## Sharing (herdr.dev/mods)

- Write the `RECIPE.md` from the real files, add a `preview.png`, put this
  folder in a public GitHub repo and add the topic `herdr-mod`; it shows up
  at herdr.dev/mods within the hour.
- The repo's layout file is this machine's personal integration (it
  references other mods the person has installed); `RECIPE.md` describes the
  two grafts that install the plugin on any main-derived layout.
- A `keys.json` here is never installed directly: merge its sections into
  the app home's `keys.json`, and ask before replacing a key already in use.
