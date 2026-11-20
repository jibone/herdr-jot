import "./stubs/hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeCx, fireWatch, host, nodeOf, resetHost, settle } from "./stubs/host.mjs";

const FILE = "/app/data/jot/jot.txt";

const { default: Jot } = await import("../main.js");

// The pad on a fresh host. The watch loop starts parked on its first
// watchFolder call; fireWatch() releases a round on demand.
function start({ checking = false, settings = null, file = null } = {}) {
  resetHost();
  host.checking = checking;
  if (settings) host.settings = settings;
  if (file !== null) host.files.set(FILE, file);
  const cx = fakeCx();
  const view = new Jot();
  view.init({}, cx);
  return { cx, view, state: view.state };
}

const type = (state, cx, text) => {
  state.set_value(text);
  state.handlers.change({}, cx);
};

// A write held mid-flight: every write parked on the same gate, released at
// the test's command.
const park = () => {
  const gate = {};
  gate.promise = new Promise((resolve) => { gate.resolve = resolve; });
  return gate;
};

// The person's save racing an external writer: the person types, their write
// parks behind the gate, and the agent's text lands on disk behind it.
const racing = (state, cx, agentText) => {
  const gate = park();
  host.writeGate = () => gate.promise;
  type(state, cx, "mine");
  host.files.set(FILE, agentText);
  return gate;
};

const plain = (x) => {
  if (Array.isArray(x)) return x.map(plain);
  if (x == null || typeof x !== "object" || !x.calls) return x;
  const calls = x.calls.flatMap(([name, args]) => {
    if (name === "children") return args[0].map((c) => ["child", plain(c)]);
    if (name === "child") return [["child", plain(args[0])]];
    return [[name, ...args.map(plain)]];
  });
  const children = calls.filter(([name]) => name === "child").map(([, child]) => child);
  const style = calls.filter(([name]) => name !== "child").sort(([a], [b]) => a.localeCompare(b));
  return { kind: x.kind, args: x.args.map(plain), style, children };
};

test("the pad opens showing the file on disk", async () => {
  const { cx, state } = start({ file: "buy milk" });
  await settle(cx);
  assert.equal(state.value(), "buy milk");
});

test("no file yet: the pad starts empty, and the first save creates it", async () => {
  const { cx, state } = start();
  await settle(cx);
  assert.equal(state.value(), "");
  type(state, cx, "first note");
  await settle(cx);
  assert.deepEqual(host.writes, [[FILE, "first note", null]]);
  assert.equal(host.files.get(FILE), "first note");
});

test("the editor is the pad: soft-wrapped, with the one-line placeholder", () => {
  const { state } = start();
  assert.equal(state.soft_wrap, true);
  assert.equal(state.placeholder, "Jot anything — one pad for every space, saved as you type.");
});

test("a keystroke that lands before the seed read wins: the file is created from the editor", async () => {
  const { cx, state } = start({ file: "old text on disk" });
  type(state, cx, "faster than the seed");
  await settle(cx);
  assert.equal(state.value(), "faster than the seed");
  assert.deepEqual(host.writes, [[FILE, "faster than the seed", null]]);
});

test("one write in flight at a time, and the file ends with the latest text", async () => {
  const { cx, state } = start();
  await settle(cx);
  const gate = park();
  host.writeGate = () => gate.promise;
  type(state, cx, "one");
  type(state, cx, "two");
  await settle(cx);
  assert.deepEqual(host.writes.map(([, text]) => text), ["one"]);
  gate.resolve();
  await settle(cx);
  assert.deepEqual(host.writes.map(([, text]) => text), ["one", "two"]);
  assert.equal(host.files.get(FILE), "two");
});

test("an agent's note lands in the open pad, and the next save expects it", async () => {
  const { cx, state } = start();
  await settle(cx);
  host.files.set(FILE, "- from an agent");
  fireWatch([FILE]);
  await settle(cx);
  assert.equal(state.value(), "- from an agent");
  assert.equal(cx.notified, 1);
  type(state, cx, "- from an agent\n- and me");
  await settle(cx);
  assert.deepEqual(host.writes, [[FILE, "- from an agent\n- and me", "- from an agent"]]);
  assert.equal(host.files.get(FILE), "- from an agent\n- and me");
});

test("a watch round that finds nothing new leaves the editor alone", async () => {
  const { cx, state } = start();
  await settle(cx);
  type(state, cx, "mine");
  await settle(cx);
  fireWatch([FILE]);
  await settle(cx);
  assert.equal(state.value(), "mine");
  assert.equal(cx.notified, 0);
});

test("while the person's save is in flight, the external write waits and loses", async () => {
  const { cx, state } = start();
  await settle(cx);
  const gate = racing(state, cx, "- agent sneaks in");
  fireWatch([FILE]);
  await settle(cx);
  assert.equal(state.value(), "mine");
  gate.resolve();
  await settle(cx);
  assert.equal(host.files.get(FILE), "mine");
  assert.equal(state.value(), "mine");
});

test("an external write of the very text we wanted is taken as ours", async () => {
  const { cx, state } = start({ file: "on disk" });
  await settle(cx);
  const gate = racing(state, cx, "mine");
  gate.resolve();
  await settle(cx);
  assert.deepEqual(host.writes, [[FILE, "mine", "on disk"]]);
  assert.equal(host.files.get(FILE), "mine");
});

test("a conflicting write is retried once against the disk text, and wins", async () => {
  const { cx, state } = start({ file: "on disk" });
  await settle(cx);
  const gate = racing(state, cx, "- agent got there first");
  gate.resolve();
  await settle(cx);
  assert.deepEqual(host.writes, [
    [FILE, "mine", "on disk"],
    [FILE, "mine", "- agent got there first"],
  ]);
  assert.equal(host.files.get(FILE), "mine");
});

test("a write that loses twice gives up, and the next keystroke re-bases on the disk", async () => {
  const { cx, state } = start({ file: "on disk" });
  await settle(cx);
  host.writeGate = () => {
    host.files.set(FILE, `- agent beat write ${host.writes.length}`);
    return Promise.resolve();
  };
  type(state, cx, "mine");
  await settle(cx);
  assert.equal(host.writes.length, 2);
  assert.equal(state.value(), "mine");
  host.writeGate = null;
  type(state, cx, "mine too");
  await settle(cx);
  assert.deepEqual(host.writes.at(-1), [FILE, "mine too", "- agent beat write 2"]);
  assert.equal(host.files.get(FILE), "mine too");
});

test("under herdr-app check the watch never starts, and it still draws", async () => {
  const { cx, view, state } = start({ checking: true, file: "stored" });
  await settle(cx);
  assert.deepEqual(host.watches, []);
  assert.equal(state.value(), "stored");
  assert.equal(nodeOf(view.render()).kind, "v_flex");
});

test("the pad draws a card: the Jot header, the one-liner, the editor in the mono font", async () => {
  const { cx, view, state } = start();
  await settle(cx);
  const tree = plain(nodeOf(view.render()));
  assert.equal(tree.kind, "v_flex");
  const [header, editor] = tree.children;
  assert.equal(header.kind, "h_flex");
  assert.deepEqual(header.children.map((c) => c.children), [["Jot"], ["one pad · every space"]]);
  assert.equal(editor.kind, "Textarea");
  assert.equal(editor.args[0], state);
  assert.deepEqual(editor.style.find(([name]) => name === "font_family"), ["font_family", "Test Mono"]);
});

test("no font in settings: the editor falls back to Herdr's bundled mono", async () => {
  const { cx, view } = start({ settings: {} });
  await settle(cx);
  const tree = plain(nodeOf(view.render()));
  assert.deepEqual(tree.children[1].style.find(([name]) => name === "font_family"), ["font_family", "JetBrains Mono"]);
});
