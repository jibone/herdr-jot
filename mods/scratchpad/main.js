// The app-wide Scratchpad: one free-text pane, one text file, every space.
// The layout places this mod ("place": "none"); the tabs-scratchpad fork's
// Scratchpad button and cmd-shift-s toggle the hidden "scratchpad" block.
//
// The pad is a small block editor over that one file. Each line is a block —
// a # heading, a --- rule, a - [ ] todo, a ``` fence of code, or plain
// markdown text — drawn mono with no editor chrome: no line numbers, no
// folding, nothing that looks like an editor. Click a block to edit it in
// place; every keystroke splices straight into the document and saves
// through the atomic writer, so the file is current at every moment. Click
// a todo's box to tick it. The last empty line is always editable: the
// pad's endless new line.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Textarea, TextareaState, Editor, EditorState, TextView } from "gpui-base";
import { appHome, readTextFile, writeTextFile, theme, settings } from "herdr";

const file = () => `${appHome()}/data/scratchpad/scratchpad.txt`;
const mono = () => settings().font_family ?? "JetBrains Mono";
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

function lineBlock(raw, at) {
  let m = raw.match(/^(#{1,6})\s+(.*)$/);
  if (m) return { kind: "h", from: at, to: at, level: Math.min(m[1].length, 3), text: m[2] };
  if (/^---+\s*$/.test(raw)) return { kind: "rule", from: at, to: at };
  m = raw.match(/^(\s*)([-*+])\s+\[([ xX])\]\s?(.*)$/);
  if (m) return { kind: "todo", from: at, to: at, checked: m[3] !== " ", label: m[4] };
  if (raw === "") return { kind: "spacer", from: at, to: at };
  return { kind: "text", from: at, to: at, text: raw };
}

// Blocks cover `lines[base .. base + lines.length)`. A fence without its
// closer runs to the end of the range; the caller decides what that means.
function parseLines(lines, base, self, cx) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (/^```/.test(raw)) {
      let j = i + 1;
      while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
      const closed = j < lines.length;
      out.push(self.codeBlock(base + i, (closed ? j : lines.length - 1) + base, closed, closed ? undefined : base + lines.length, cx));
      i = (closed ? j : lines.length - 1) + 1;
      continue;
    }
    out.push(lineBlock(lines[i], base + i));
    i++;
  }
  return out;
}

export default class Scratchpad extends View {
  init(_props, cx) {
    this.lines = null;      // the document, line by line — null until the file loads
    this.blocks = [];       // parsed blocks; stable objects, resolved by identity
    this.edit = null;       // { block, state } while one block is being edited
    this.expected = null;
    this.pending = undefined;
    this.writing = null;
    cx.spawn(async (cx) => {
      const text = await readTextFile(file()).catch(() => null);
      this.setDoc(text ?? "", cx);
    });
  }

  // ---- the document ------------------------------------------------------

  setDoc(text, cx) {
    this.expected = text;
    this.lines = text.split("\n");
    this.reparse(cx);
    // An unclosed fence left behind by an outside edit would swallow the
    // whole pad on the next reload; close it before anything shows.
    const last = this.blocks[this.blocks.length - 1];
    if (last && last.kind === "code" && !last.closed) {
      this.lines.push("```");
      last.to = this.lines.length - 1;
      last.closed = true;
      this.save(cx);
    }
    this.ensureTail(cx);
    cx.notify();
  }

  reparse(cx) {
    for (const b of this.blocks) b.state?.release();
    this.blocks = parseLines(this.lines, 0, this, cx);
    this.ensureTail(cx);
  }

  // The pad always ends with one editable empty line: its endless new line.
  ensureTail(cx) {
    if (this.lines[this.lines.length - 1] !== "") {
      this.lines.push("");
      this.blocks.push({ kind: "tail", from: this.lines.length - 1, to: this.lines.length - 1 });
      this.save(cx);
    } else {
      const last = this.blocks[this.blocks.length - 1];
      if (last && last.to === this.lines.length - 1 && (last.kind === "spacer" || last.kind === "tail")) last.kind = "tail";
    }
  }

  codeBlock(from, to, closed, contentEnd, cx) {
    const b = { kind: "code", from, to, closed, lang: this.lines[from].replace(/^```/, "").trim() };
    const t = theme();
    const opts = {
      value: this.lines.slice(from + 1, contentEnd ?? this.lines.length).join("\n"),
      line_numbers: false,   // code that doesn't look like an editor
      folding: false,
      soft_wrap: false,      // long lines scroll sideways instead
      font_family: mono(),
      font_size: 12,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 },
    };
    if (b.lang) opts.language = b.lang;
    b.state = EditorState.new(opts);
    b.state.on("change", (_e, c) => this.spliceCode(b, c));
    return b;
  }

  // ---- editing -----------------------------------------------------------

  // Click a block: it becomes a textarea holding its raw text. Every
  // keystroke splices into the document and saves; blur (or Escape, if the
  // key bubbles) commits: the block re-splits where its lines demand it.
  startEdit(b, cx) {
    if (this.edit) {
      if (this.edit.block === b) return;
      this.commitEdit(cx);
    }
    if (this.blocks.indexOf(b) < 0) return;
    const raw = this.lines.slice(b.from, b.to + 1).join("\n");
    const state = TextareaState.new({ value: raw, placeholder: "# heading · - [ ] todo · ``` code" });
    state.set_soft_wrap(true);
    state.set_auto_grow(1, 60);
    state.on("change", (_e, c) => this.spliceEdit(c));
    state.on("blur", (_e, c) => { if (this.edit?.state === state) this.commitEdit(c); });
    this.edit = { block: b, state };
    state.focus();
    state.set_selected_range({ start: raw.length, end: raw.length });
    cx.notify();
  }

  spliceEdit(cx) {
    const e = this.edit;
    if (!e) return;
    const b = e.block;
    const next = e.state.value().split("\n");
    this.lines.splice(b.from, b.to - b.from + 1, ...next);
    b.to = b.from + next.length - 1;   // keep this block's range current for the next keystroke
    this.save(cx);
  }

  commitEdit(cx) {
    const e = this.edit;
    if (!e) return;
    this.edit = null;
    const b = e.block;
    // this.lines[b.from..b.to] already equals the editor's text (spliced per
    // keystroke): re-split that one block, leaving every other block object
    // — and its place — alone.
    const rawLines = e.state.value().split("\n");
    const oldLen = b.to - b.from + 1;
    const sub = parseLines(rawLines, b.from, this, cx);
    let extra = 0;
    const last = sub[sub.length - 1];
    if (last && last.kind === "code" && !last.closed) {
      // A fence typed without its closer would swallow the pad on reload:
      // close it for the person now.
      this.lines.splice(last.to + 1, 0, "```");
      last.to += 1;
      last.closed = true;
      extra = 1;
    }
    const idx = this.blocks.indexOf(b);
    this.blocks.splice(idx, 1);
    const shift = rawLines.length - oldLen + extra;
    for (const o of this.blocks) if (o.from > b.to) { o.from += shift; o.to += shift; }
    this.blocks.splice(idx, 0, ...sub);
    this.save(cx);
    this.ensureTail(cx);
    e.state.release();
    cx.notify();
  }

  // Code blocks are edited right in their editor: no raw fences in sight.
  spliceCode(b, cx) {
    if (!b.closed) return;   // auto-closed before it can ever be edited
    const oldLen = b.to - b.from - 1;
    const next = b.state.value().split("\n");
    this.lines.splice(b.from + 1, oldLen, ...next);
    const delta = next.length - oldLen;
    b.to += delta;
    for (const o of this.blocks) if (o !== b && o.from > b.from) { o.from += delta; o.to += delta; }
    this.save(cx);
  }

  toggleTodo(b, cx) {
    const checked = !b.checked;
    this.lines[b.from] = this.lines[b.from].replace(/\[( |x|X)\]/, checked ? "[x]" : "[ ]");
    b.checked = checked;
    this.save(cx);
    cx.notify();
  }

  // ---- saving ------------------------------------------------------------
  // One write in flight at a time, the latest text first: no self-races, no
  // lost keystrokes. writeTextFile is atomic and writes only while the file
  // still matches the expected snapshot: another window's edit rejects
  // ours, the disk becomes the new snapshot and the write is retried once —
  // the latest writer wins, like Herdr's own shared state.

  save(cx) {
    this.pending = this.lines.join("\n");
    if (this.writing) return;
    this.writing = cx.spawn(async () => {
      for (;;) {
        const text = this.pending;
        if (text === undefined) break;
        this.pending = undefined;
        try {
          await writeTextFile(file(), text, this.expected);
          this.expected = text;
        } catch {
          const disk = await readTextFile(file()).catch(() => null);
          if (disk === text) { this.expected = text; continue; }
          try {
            await writeTextFile(file(), text, disk);
            this.expected = text;
          } catch { /* lost again; the next keystroke retries */ }
        }
      }
      this.writing = null;
    });
  }

  // ---- drawing -----------------------------------------------------------

  render() {
    const t = theme(), f = mono();
    return v_flex().id("scratchpad").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Scratchpad"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child("one pad · every space")))
      .child(v_flex().id("pad-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(10)
        .when(this.lines === null, el => el.child(div().p(6).text_size(12).text_color(t.dim).child("Loading…")))
        .when(this.lines !== null, el => el.children(this.blocks.map(b => this.block(b, t, f)))));
  }

  block(b, t, f) {
    if (this.edit && this.edit.block === b) {
      return div().id(`edit-${b.from}`)
        .on_key_down((ev, c) => { if (ev.keystroke === "escape") this.commitEdit(c); })
        .child(Textarea.new(this.edit.state).font_family(f).text_size(13));
    }
    const edit = (el) => el.cursor_pointer().on_click((_e, c) => this.startEdit(b, c));
    switch (b.kind) {
      case "h":
        return edit(div().id(`h-${b.from}`).py(b.level === 1 ? 7 : b.level === 2 ? 5 : 4)
          .font_family(f).font_semibold().text_size(b.level === 1 ? 19 : b.level === 2 ? 16.5 : 15)
          .child(b.text || "\u00a0"));
      case "rule":
        return edit(div().id(`rule-${b.from}`).py(6)).child(div().h(1).bg(t.border));
      case "todo": {
        const box = div().id(`todo-box-${b.from}`).size(15).mt(2).flex_none().rounded(4).flex().items_center().justify_center()
          .border(1).border_color(b.checked ? t.accent : t.border)
          .when(b.checked, el => el.bg(t.accent).text_color(t.accent_foreground).text_size(10).font_semibold().child("✓"))
          .cursor_pointer().on_click((_e, c) => this.toggleTodo(b, c));
        return h_flex().id(`todo-${b.from}`).items_start().gap(8)
          .child(box)
          .child(edit(div().id(`todo-label-${b.from}`).flex_1().min_w(0).font_family(f)
            .text_color(b.checked ? t.dim : t.foreground)
            .when(b.checked, el => el.line_through())
            .child(b.label || "\u00a0")));
      }
      case "code":
        return v_flex().id(`code-${b.from}`).my(4).rounded(8).overflow_hidden().bg(t.surface).border_1().border_color(t.border)
          .child(Editor.new(b.state));
      case "tail":
        return edit(h_flex().id("pad-tail").h(24).items_center().gap(6)
          .child(div().text_size(13).text_color(t.dim).child("+"))
          .child(div().text_size(11.5).text_color(t.dim).child("add a line")));
      case "spacer":
        return div().id(`space-${b.from}`).h(9);
      default:
        // Plain lines pass through TextView.markdown, so **bold**, `code`
        // and links work inline; the id carries a content hash so a changed
        // line is always a fresh element.
        return edit(div().id(`text-${b.from}`).py(1))
          .child(TextView.markdown(`sp-${b.from}-${hash(b.text)}`, b.text).selectable(false).font_family(f).text_size(13));
    }
  }
}
