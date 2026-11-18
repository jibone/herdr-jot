# herdr-scratchpad

A **Herdr app plugin**: one Scratchpad for the whole app.

![Scratchpad](preview.png)

A "Scratchpad" pill sits in the tab bar next to Files and Changes. Click it
(or press `cmd-shift-s`) and a free-text pane opens on the right side of the
window. It's one pad for the whole app: the same text in every space, saved
as you type to a single text file, still there after a restart or a hot
reload.

## What you get

- **One pad, every space** — the text lives in
  `~/.config/herdr-app/data/scratchpad/scratchpad.txt`, so every space sees
  the same contents.
- **Saved as you type** — every change is written atomically (latest wins);
  there's no save button and nothing to forget.
- **Native feel** — the pill matches the Files/Changes buttons, the pane is
  a card like the terminal panes, and each space remembers whether it had
  the pad open, exactly like Files and Changes.
- **A keyboard way in** — `cmd-shift-s` toggles it while the layout shows.
- **Plain wrapped text, in mono** — one comfortable textarea in the
  terminals' font (JetBrains Mono unless settings.json names another), in
  your theme, light or dark.

## Install

Requires the [Herdr app](https://herdr.dev) and a layout derived from
Herdr's shipped `main`.

```sh
# 1. the two mods
rsync -a mods/ ~/.config/herdr-app/mods/

# 2. the layout: copy mine if yours is close enough to shipped main
rsync -a layouts/ ~/.config/herdr-app/layouts/
```

`layouts/main-copy.json` in this repo is my personal daily layout (a clone
of `main` with my own mods wired in). To install on your own setup instead,
graft two edits onto any main-derived layout:

- point the `tabs` block at `"tabs-scratchpad"`
- add the hidden right-side block to `work-body`, after `panel`:

```json
{ "id": "scratchpad", "type": "block", "content": { "mod": "scratchpad" },
  "size": { "px": 340 }, "min": 260, "max": 900, "hidden": true }
```

Then merge this repo's `keys.json` into `~/.config/herdr-app/keys.json`
(check the key isn't already bound first), and verify:

```sh
herdr-app check ~/.config/herdr-app/mods/scratchpad
herdr-app check ~/.config/herdr-app/mods/tabs-scratchpad
```

## Repo layout

| Path | What |
|---|---|
| `mods/scratchpad/` | the pane: `main.js`, `mod.json`, `icon.svg` |
| `mods/tabs-scratchpad/` | fork of Herdr's shipped tab bar: the Scratchpad pill + per-space open memory |
| `layouts/main-copy.json` | this machine's daily layout, grafted — `RECIPE.md` describes the generic graft |
| `keys.json` | the `cmd-shift-s` binding to merge by hand |
| `RECIPE.md` | the brief to rebuild the whole plugin from scratch |
| `AGENTS.md` | instructions for coding agents working in this repo |

## Notes & trade-offs

- Herdr's own layouts and mods are read-only; putting a pill in that tab
  bar means forking it. The fork (`tabs-scratchpad`) is frozen at the
  version it was cloned from — if Herdr ships tab-bar changes, re-clone and
  re-apply (the fork's header comment lists its change set).
- Switching to the fork resets Files/Changes per-space panel memory once.
- The pad saves on every change; the text file is the source of truth
  (Herdr's `readTextFile` caps it at 1 MiB).

For agents and contributors: read `AGENTS.md` first — it points at
`~/.config/herdr-app/AGENTS.md`, the Herdr app's own agent guide, as the
source of truth for the mod API.
