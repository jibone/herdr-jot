# Scratchpad

A whole-app Scratchpad for the Herdr app: a "Scratchpad" pill in the tab bar
after Files / Changes that opens a free-text pane on the right side of the
window. One pad for the whole app — the same text in every space, on every
screen, saved as you type to one text file.

![Scratchpad](preview.png)

## What you see

- The tab bar carries a "Scratchpad" pill after "Changes" (26 px tall, 12 px
  type, a notepad glyph, the bar's muted text color until hovered or active).
  While the pad is open the pill takes the theme's `selected` background, the
  same active look Files and Changes have.
- The pad is its own right-side column beside the Files / Changes panel
  (340 px default, 260–900, drag the divider): a card like the terminal
  panes — theme `background`, 1 px `border`, 10 px corners — with a 42 px
  header: "Scratchpad" in semibold 13 px, right-aligned "one pad · every
  space" in dim 12 px, a 1 px rule under it.
- The body is a plain wrapped text area, theme foreground on `background`,
  13 px, padded 14 px sides / 12 px top and bottom. Empty, it carries the
  placeholder "Jot anything — one scratchpad for every space, saved as you
  type."

## How it behaves

- Clicking the pill — or pressing `cmd-shift-s` while this layout shows —
  runs `layout.toggle {id: "scratchpad"}`: the pad opens beside the tab's
  panes; click or press again to close. The divider drags and the width is
  kept.
- Each space remembers its own open/closed choice, exactly as Files and
  Changes do: switching spaces restores that space's choice, and opening or
  closing records the current one.
- Typing saves the whole text after each change (atomic, latest wins) to
  `data/scratchpad/scratchpad.txt` in the app's home folder. Restart the app
  or hot-reload the mod and the text is still there; the cursor position
  resets to where the editor starts.
- No agent status is involved; nothing here changes with terminal state.

## Built from

- `layouts/main-copy.json` — the person's daily layout (a clone of Herdr's
  shipped `main` v0.1.12) with two grafts: the `tabs` block's mod pointed at
  `tabs-scratchpad`, and a hidden block added to `work-body` after `panel`:
  `{ "id": "scratchpad", "type": "block", "content": { "mod": "scratchpad" },
  "size": { "px": 340 }, "min": 260, "max": 900, "hidden": true }`. On a
  fresh machine, graft the same two edits onto any main-derived layout; the
  rest of this file is personal (it references herdr-nvim and gitview mods
  the person has installed).
- `mods/scratchpad/` — the pane. `TextareaState.new({ placeholder })` with
  `set_soft_wrap(true)` created in `init` (a host call; never in render),
  `Textarea.new(state)` sized `flex_1().min_h(0)` in a full-height
  `v_flex`, card chrome copied from the shipped `files` mod. From `herdr`:
  `readTextFile`/`writeTextFile` with `appHome()`; writes are
  compare-to-expected and serialized through one loop that always writes the
  latest text first, so fast typing cannot race itself. On a rejected write
  the disk text becomes the new snapshot and the write is retried once —
  latest writer wins. `mod.json` is `{ "place": "none" }`; art is one 24×24
  one-color stroke glyph (`icon.svg`) drawn in the Changes icon's style.
- `mods/tabs-scratchpad/` — Herdr's shipped `tabs` mod forked: its own
  `win-*.svg` assets, a `padButton` pill bound to `layout.toggle`, and a
  `syncPad` per-space memory mirroring the shipped `syncPanel` (localStorage
  `"pads"`). On layouts without a `scratchpad` block the pill is not drawn
  and the fork renders exactly what the shipped tab bar renders.
- Shipped things used as-is: the `files` card look, `mods/pane/close.svg`,
  `mods/workspace-chrome/spinner.svg`, `mods/files/file.svg`,
  `mods/changes/changes.svg`.
- `keys.json`: `"layout:main-copy": { "cmd-shift-s": { "command":
  "layout.toggle", "args": { "id": "scratchpad" } } }`, merged by hand into
  the app home's keys.

## Watch out

- The `tabs` fork and the layout clone are frozen: Herdr never updates a
  clone. If the shipped tab bar changes, re-clone it and re-apply the
  fork's change set (its header comment lists it).
- The fork's per-space memories live in its own localStorage (`"pads"` for
  the scratchpad), separate from the shipped tabs mod's `"panels"`: the
  first run resets Files/Changes per-space memory once.
- Two windows editing at once: writes are compare-to-expected and atomic, so
  the latest change wins; a losing window re-bases on its next keystroke.
  Two people typing in the same moment can interleave.
- The pad saves on `change` only: a hard crash within the same keystroke can
  lose that one keystroke; there is no timer save.
- `readTextFile` caps at 1 MiB: the pad is not a place for megabyte notes.
- `Textarea` must be given a height by its container (`flex_1().min_h(0)`
  inside a full-height column); left unsized it draws one input row tall.
- Text seeded straight to the file after the pad has already started
  appears only on the next reload; the editor in the window is what writes,
  and it always wins.

## Done when

- `herdr-app check` passes for both `mods/scratchpad` and
  `mods/tabs-scratchpad`, and `herdr-app status` shows no errors with the
  pad open.
- The pill sits after Changes, highlights while open, and toggles the pad;
  `cmd-shift-s` does the same.
- Typed text reappears after an app restart and after saving any file in the
  mod folder (hot reload), and the text file on disk matches the pad.
- The same text shows from a different space, and each space restores its
  own open/closed state when switched to.
