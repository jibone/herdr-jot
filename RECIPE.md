# Scratchpad

A whole-app Scratchpad for the Herdr app: a "Scratchpad" pill in the tab bar
after Files / Changes that opens a notes pane on the right side of the
window. One pad for the whole app — the same text in every space, saved as
you type to one text file, still there after a restart or a hot reload.

![Scratchpad](preview.png)

## What you see

- Everything in the pad is mono (the terminal font from settings.json,
  falling back to JetBrains Mono) — a notes pane that shares its type with
  the terminals beside it, with no editor chrome anywhere: no line numbers,
  no folding, no gutter.
- The card: theme background, 1 px border, 10 px corners, a 42 px header with
  "Scratchpad" and the dim right-aligned "one pad · every space".
- The document is a column of blocks:
  - `# / ## / ###` headings: semibold, 19 / 16.5 / 15 px.
  - `---` rules: a 1 px theme-border line.
  - `- [ ]` / `- [x]` todos: a 15 px checkbox (accent-filled with a ✓ when
    done), the label struck through and dimmed when done.
  - ```` ``` ```` fences: code cards on theme surface with syntax coloring
    from the terminal's ANSI palette, 12 px, no line numbers, no folding;
    long lines scroll sideways, they never wrap.
  - the pad always ends with an empty line carrying a dim hint:
    `# heading · - [ ] todo · ``` code`.

## How it behaves

The document is the editor, the way Notion works:

- Every text line is a live one-row text field styled to look like bare
  text. Click anywhere and the caret lands exactly there; just type.
- Structure converts mid-keystroke and never shows its syntax: typing
  `# ` instantly restyles the block as a heading with the prefix stripped
  (it lives in the file, spliced back on every keystroke). `- [ ] ` becomes
  a todo, ``` drops the caret into a fresh code editor, `---` becomes a
  rule. Clearing a heading's text gives the line back to plain text.
- Enter splits the block and the caret lands on the new empty line below.
  Paste expands at once: paragraphs become blocks, a pasted fence becomes a
  live code card (an unclosed fence is closed for you).
- Todos tick with one click on the box, saved immediately.
- Code blocks are edited in place; the fences never show.
- Click a rule to get its line back as editable text.
- Everything saves per keystroke, atomically, to one text file.
- The pill and `cmd-shift-s` toggle the pane; each space remembers whether
  it had the pad open, exactly like Files and Changes.

## Built from

- `mods/scratchpad/` — the pane. The file's lines parse into block objects
  (`kind`, `from`, `to`, per-kind fields); blocks are stable objects, so
  handlers resolve them by identity, never by a stale index. Each text-ish
  block owns a retained `TextareaState` (`set_auto_grow(1, 1)`, mono via
  `.font_family`), created at parse or block-creation time — host calls,
  never in render — and released when a block is replaced. Heading and
  todo editors hold only the content; `writeBlock` splices the prefix back
  into the file line and saves. `onBlockChange` classifies live
  (`classifyLive`), splits on newlines (`expand` re-parses the block's new
  lines into a block sequence and focuses the last), and guards
  programmatic `set_value` with a `projecting` flag. Code blocks own an
  `EditorState.new({ line_numbers: false, folding: false, soft_wrap: false,
  font_family, font_size: 12, syntax: <theme ANSI colors> })`, splicing
  their content between the fences on change. Mono is
  `settings().font_family ?? "JetBrains Mono"`. Saving is one serialized
  writer loop over `writeTextFile` (atomic, compare-to-expected, latest
  wins) — unchanged from the first build.
- `mods/tabs-scratchpad/` — unchanged from the first build.
- `layouts/main-copy.json` — the daily layout; the pad block's default
  width is 400 px.
- `keys.json`: `"layout:main-copy": { "cmd-shift-s": ... }` as before.
- Art: the 24×24 one-color notepad glyph (`icon.svg`), unchanged.

## Watch out

- Undo is per block (inside the focused field); a conversion or a tick
  isn't undoable, and there is no drag-handle reordering or multi-block
  selection.
- Inline emphasis shows raw (`**bold**` stays literal) — the trade for
  every line being live-editable with zero swaps.
- Arrow-up/down between blocks and Backspace joining an emptied line into the
  one above ride one focus handle tracked on the whole pad: what the native
  field doesn't use arrives there. Enter, click and paste flows are
  guaranteed regardless.
- Typing a ``` line inside a code block's content would close the block on
  the next reload (the live view stays as it was) — don't.
- `herdr-app check` validates the loading render; blocks appear after the
  async file read, so the live window is where content is exercised.
- Two windows editing at once: atomic compare-to-expected writes, latest
  writer wins.
- `readTextFile` caps at 1 MiB: the pad is not a place for megabyte notes.

## Done when

- `herdr-app check` passes and `herdr-app status` shows no errors with the
  pad open.
- Clicking anywhere in a line puts the caret there; typing saves per
  keystroke and the pad survives a restart and a hot reload.
- `# ` turns into a heading while typing, `- [ ] ` into a tickable todo,
  ``` into a code editor with the caret inside, `---` into a rule — each
  without its syntax ever showing.
- Enter splits; paste expands; a pasted fence becomes a code card; an
  unclosed fence closes itself.
- Clearing a heading reverts it to text; clicking a rule makes it editable.
- The same text shows from a different space; each space restores its own
  open/closed state.
- `cmd-shift-s` and the pill still toggle the pane.
