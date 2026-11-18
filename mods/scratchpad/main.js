// The app-wide Scratchpad: one notes pane, one text file, every space.
// The layout places this mod ("place": "none"); the tabs-scratchpad fork's
// Scratchpad button and cmd-shift-s toggle the hidden "scratchpad" block.
//
// The pad works like Notion: the document is the editor. Every text line is
// a live one-row textarea styled to look like bare text, so clicking
// anywhere puts the caret exactly there — no modes, no conversions on blur.
// Markdown structure converts while you type and never shows its syntax:
// `# ` becomes a heading, `- [ ] ` a tickable todo, ``` a code editor,
// --- a rule. Enter splits the block; paste expands into blocks. The
// heading/todo editors hold only the content — the prefixes live in the
// file, spliced back on every keystroke and saved atomically.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Textarea, TextareaState, Editor, EditorState } from "gpui-base";
import { appHome, readTextFile, writeTextFile, theme, settings } from "herdr";

const file = () => `${appHome()}/data/scratchpad/scratchpad.txt`;
const mono = () => settings().font_family ?? "JetBrains Mono";
const HINT = "# heading · - [ ] todo · ``` code";
const HEAD = /^```/;
const CLOSE = /^```\s*$/;

// What a plain text line turns into the moment it is typed or pasted.
function classifyLive(value) {
  let m = value.match(/^(#{1,3})(\s+)(.*)$/);
  if (m) return { kind: "h", level: m[1].length, cut: m[0].length - m[3].length };
  m = value.match(/^([-*+])(\s*)\[([ xX])\](\s?)(.*)$/);
  if (m) return { kind: "todo", checked: m[3] !== " ", bullet: m[1], cut: m[0].length - m[5].length };
  if (HEAD.test(value)) return { kind: "code" };
  if (/^---+\s*$/.test(value)) return { kind: "rule" };
  return null;
}

// Blocks cover `lines[base .. base + lines.length)`. A fence without its
// closer runs to the end of the range; the caller decides what that means.
function parseLines(lines, base, self, cx) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (HEAD.test(raw)) {
      let j = i + 1;
      while (j < lines.length && !CLOSE.test(lines[j])) j++;
      const closed = j < lines.length;
      out.push(self.codeBlock(base + i, (closed ? j : lines.length - 1) + base, closed, closed ? undefined : base + lines.length, cx));
      i = (closed ? j : lines.length - 1) + 1;
      continue;
    }
    let m = raw.match(/^(#{1,3})\s+(.*)$/);
    if (m) out.push(self.hBlock(base + i, m[1].length, m[2]));
    else if ((m = raw.match(/^([-*+])(\s*)\[([ xX])\]\s?(.*)$/))) out.push(self.todoBlock(base + i, m));
    else if (/^---+\s*$/.test(raw)) out.push({ kind: "rule", from: base + i, to: base + i });
    else out.push(self.textBlock(raw, base + i, false));
    i++;
  }
  return out;
}

export default class Scratchpad extends View {
  init(_props, cx) {
    this.lines = null;      // the document, line by line — null until the file loads
    this.blocks = [];       // parsed blocks; stable objects, resolved by identity
    this.expected = null;
    this.pending = undefined;
    this.writing = null;
    this.projecting = false;   // programmatic set_value: don't re-classify
    this.focused = null;       // the block whose editor holds the keyboard
    this.h = cx.focus_handle();   // puts the pad on the keyboard's path (track_focus)
    cx.spawn(async (cx) => {
      const text = await readTextFile(file()).catch(() => null);
      this.setDoc(text ?? "", cx);
    });
  }

  // ---- block factories --------------------------------------------------

  textState(value, placeholder) {
    const state = TextareaState.new(placeholder ? { value, placeholder } : { value });
    state.set_auto_grow(1, 1);   // one row, always: Enter splits instead of growing
    return state;
  }

  wire(b, state) {
    state.on("change", (_e, c) => { if (!this.projecting) this.onBlockChange(b, c); });
    state.on("focus", () => { this.focused = b; });
    state.on("blur", () => { if (this.focused === b) this.focused = null; });
    return state;
  }

  textBlock(raw, at, tail) {
    const b = { kind: "text", from: at, to: at, tail };
    b.state = this.wire(b, this.textState(raw, tail ? HINT : undefined));
    return b;
  }

  hBlock(at, level, title) {
    const b = { kind: "h", from: at, to: at, level, wasNonEmpty: title !== "" };
    b.state = this.wire(b, this.textState(title));
    return b;
  }

  todoBlock(at, m) {
    const b = { kind: "todo", from: at, to: at, checked: m[3] !== " ", bullet: m[1] };
    b.state = this.wire(b, this.textState(m[4]));
    return b;
  }

  codeBlock(from, to, closed, contentEnd, cx) {
    const b = { kind: "code", from, to, closed, lang: this.lines[from].replace(HEAD, "").trim() };
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

  // The pad always ends with one editable empty line: its endless cursor.
  ensureTail(cx) {
    if (this.lines[this.lines.length - 1] !== "") {
      this.lines.push("");
      this.blocks.push(this.textBlock("", this.lines.length - 1, true));
      this.save(cx);
      return true;
    }
    const last = this.blocks[this.blocks.length - 1];
    if (last && last.kind === "text" && last.to === this.lines.length - 1) last.tail = true;
    return false;
  }

  // The file line for a block: prefixes live here, never in the editor.
  writeBlock(b, value, cx) {
    if (b.kind === "h") this.lines[b.from] = "#".repeat(b.level) + " " + value;
    else if (b.kind === "todo") this.lines[b.from] = `${b.bullet} [${b.checked ? "x" : " "}] ${value}`;
    else this.lines[b.from] = value;
    this.save(cx);
  }

  // ---- typing ------------------------------------------------------------

  onBlockChange(b, cx) {
    if (this.projecting) return;
    const value = b.state.value();
    if (value.includes("\n")) { this.expand(b, value, cx); return; }
    if (b.kind === "text") {
      const conv = classifyLive(value);
      if (conv) { this.convert(b, conv, value, cx); return; }
    } else if (b.kind === "h") {
      // Clearing a heading's text gives the line back to plain text.
      if (value === "" && b.wasNonEmpty) {
        b.kind = "text";
        this.writeBlock(b, "", cx);
        cx.notify();
        return;
      }
      b.wasNonEmpty = value !== "";
    }
    this.writeBlock(b, value, cx);
    if (this.ensureTail(cx)) cx.notify();
  }

  // Enter or a paste: the newlines become new blocks at once.
  expand(b, value, cx) {
    const idx = this.blocks.indexOf(b);
    // The editor holds projected text: put the block's own prefix back on
    // the first line before anything is written or parsed, or Enter in a
    // heading would strip its `# `.
    const next = value.split("\n");
    if (b.kind === "h") next[0] = "#".repeat(b.level) + " " + next[0];
    else if (b.kind === "todo") next[0] = `${b.bullet} [${b.checked ? "x" : " "}] ${next[0]}`;
    this.lines.splice(b.from, b.to - b.from + 1, ...next);
    const sub = parseLines(next, b.from, this, cx);
    let extra = 0;
    const last = sub[sub.length - 1];
    if (last && last.kind === "code" && !last.closed) {
      // A fence pasted without its closer would swallow the pad on reload:
      // close it for the person now.
      this.lines.splice(last.to + 1, 0, "```");
      last.to += 1;
      last.closed = true;
      extra = 1;
      this.save(cx);
    }
    const oldTo = b.to;
    this.blocks.splice(idx, 1);
    const shift = next.length - 1 + extra;
    for (const o of this.blocks) if (o.from > oldTo) { o.from += shift; o.to += shift; }
    this.blocks.splice(idx, 0, ...sub);
    cx.spawn(async () => b.state.release());   // not inside its own handler
    this.save(cx);
    this.ensureTail(cx);
    // The caret lands where the typing continues: the last new block.
    for (let j = sub.length - 1; j >= 0; j--) {
      const target = sub[j];
      if (target.state) {
        const text = target.state.value();
        target.state.focus();
        target.state.set_selected_range({ start: text.length, end: text.length });
        break;
      }
    }
    cx.notify();
  }

  // `# `, `- [ ] `, ``` , --- : the block becomes what was typed, prefix
  // stripped from the editor so only the content shows.
  convert(b, conv, value, cx) {
    if (conv.kind === "code") {
      const idx = this.blocks.indexOf(b);
      const lang = value.replace(HEAD, "").trim();
      this.lines.splice(b.from, b.to - b.from + 1, value, "```");
      const nb = this.codeBlock(b.from, b.from + 1, true, undefined, cx);
      this.blocks.splice(idx, 1);
      for (const o of this.blocks) if (o.from > b.to) { o.from++; o.to++; }
      this.blocks.splice(idx, 0, nb);
      cx.spawn(async () => b.state.release());
      this.save(cx);
      this.ensureTail(cx);
      nb.state.focus();
      cx.notify();
      return;
    }
    if (conv.kind === "rule") {
      b.kind = "rule";
      cx.spawn(async () => b.state.release());
      b.state = null;
      this.writeBlock(b, value, cx);
      this.ensureTail(cx);
      cx.notify();
      return;
    }
    b.kind = conv.kind;
    if (conv.kind === "h") b.level = conv.level;
    if (conv.kind === "todo") { b.checked = conv.checked; b.bullet = conv.bullet; }
    b.wasNonEmpty = false;
    this.projecting = true;
    b.state.set_value(value.slice(conv.cut));
    b.state.set_selected_range({ start: 0, end: 0 });
    this.projecting = false;
    b.state.focus();            // keep typing through the restyle
    this.writeBlock(b, b.state.value(), cx);
    this.ensureTail(cx);         // a converted tail gets a fresh empty line
    cx.notify();
  }

  // Click a rule to get its line back as text.
  ruleToText(b, cx) {
    b.kind = "text";
    b.tail = false;
    b.state = this.wire(b, this.textState(this.lines[b.from]));
    b.state.focus();
    cx.notify();
  }

  toggleTodo(b, cx) {
    b.checked = !b.checked;
    this.writeBlock(b, b.state.value(), cx);
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

  // ---- keyboard between blocks -------------------------------------------
  // One focus handle on the whole pad, tracked in render, puts it on the
  // keyboard's path: what the native field doesn't use arrives here. The
  // focused block is known from each state's focus and blur events.

  padKey(e, cx) {
    const b = this.focused;
    if (!b || !b.state) return;
    const key = e.key;
    if (key === "up" || key === "arrowup" || key === "down" || key === "arrowdown") {
      if (b.kind === "code") return;   // arrows belong to the code caret
      const step = key === "up" || key === "arrowup" ? -1 : 1;
      const i = this.blocks.indexOf(b);
      let j = i + step;
      while (j >= 0 && j < this.blocks.length && !this.blocks[j].state) j += step;
      if (j < 0 || j >= this.blocks.length) return;
      const target = this.blocks[j];
      const pos = Math.min(b.state.selected_range().start, target.state.value().length);
      target.state.focus();
      target.state.set_selected_range({ start: pos, end: pos });
      cx.stop_propagation();
      return;
    }
    if (key === "backspace" && b.kind === "text" && b.state.value() === "") {
      // An emptied line joins the one above: caret to its end, line removed.
      const i = this.blocks.indexOf(b);
      if (i <= 0) return;
      let j = i - 1;
      while (j >= 0 && !this.blocks[j].state) j--;
      if (j < 0) return;
      const prev = this.blocks[j];
      const pos = prev.state.value().length;
      prev.state.focus();
      prev.state.set_selected_range({ start: pos, end: pos });
      this.lines.splice(b.from, 1);
      this.blocks.splice(i, 1);
      for (const o of this.blocks) if (o.from > b.to) { o.from--; o.to--; }
      cx.spawn(async () => b.state.release());
      this.save(cx);
      this.ensureTail(cx);
      cx.stop_propagation();
      cx.notify();
    }
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
        .track_focus(this.h)
        .on_key_down((e, c) => this.padKey(e, c))
        .when(this.lines === null, el => el.child(div().p(6).text_size(12).text_color(t.dim).child("Loading…")))
        .when(this.lines !== null, el => el.children(this.blocks.map(b => this.block(b, t, f)))));
  }

  block(b, t, f) {
    switch (b.kind) {
      case "h":
        return div().id(`h-${b.from}`).py(b.level === 1 ? 7 : b.level === 2 ? 5 : 4)
          .child(Textarea.new(b.state).font_family(f).font_semibold().text_size(b.level === 1 ? 19 : b.level === 2 ? 16.5 : 15));
      case "todo": {
        const box = div().id(`todo-box-${b.from}`).size(15).mt(2).flex_none().rounded(4).flex().items_center().justify_center()
          .border(1).border_color(b.checked ? t.accent : t.border)
          .when(b.checked, el => el.bg(t.accent).text_color(t.accent_foreground).text_size(10).font_semibold().child("✓"))
          .cursor_pointer().on_click((_e, c) => this.toggleTodo(b, c));
        return h_flex().id(`todo-${b.from}`).items_start().gap(8)
          .child(box)
          .child(Textarea.new(b.state).font_family(f).flex_1().min_w(0)
            .text_color(b.checked ? t.dim : t.foreground)
            .when(b.checked, el => el.line_through()));
      }
      case "code":
        return v_flex().id(`code-${b.from}`).my(4).rounded(8).overflow_hidden().bg(t.surface).border_1().border_color(t.border)
          .child(Editor.new(b.state));
      case "rule":
        return div().id(`rule-${b.from}`).py(6).cursor_pointer()
          .on_click((_e, c) => this.ruleToText(b, c))
          .child(div().h(1).bg(t.border));
      default:   // text: the line is the editor
        return div().id(`t-${b.from}`).py(2)
          .child(Textarea.new(b.state).font_family(f).text_size(13));
    }
  }
}
