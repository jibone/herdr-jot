// The host stand-in: enough of herdr, gpui-kit and gpui-base for main.js to
// run for real — every file call in memory, the watch loop parked until the
// test fires it, and the drawn elements recorded as plain trees.

const NODE = Symbol("node");

const fresh = () => ({
  checking: false,
  files: new Map(),
  writes: [],
  watches: [],
  gates: [],
  writeGate: null,
  settings: { font_family: "Test Mono" },
});
export const host = fresh();
export const resetHost = () => Object.assign(host, fresh());

const isElement = (x) => typeof x === "function" && x[NODE] != null;
export const nodeOf = (drawn) => drawn[NODE];

function recordArg(arg) {
  if (isElement(arg)) return arg[NODE];
  if (Array.isArray(arg)) return arg.map(recordArg);
  return arg;
}

function element(kind, args = []) {
  const node = { kind, args: args.map(recordArg), calls: [] };
  const self = new Proxy(function stub() {}, {
    get(_target, key) {
      if (key === NODE) return node;
      return (...callArgs) => {
        if (key === "children" && !Array.isArray(callArgs[0])) throw new Error("children wants an array");
        node.calls.push([key, callArgs.map(recordArg)]);
        return self;
      };
    },
  });
  return self;
}

// gpui-kit
export function View() {}
export const div = () => element("div");

// gpui-base
export const h_flex = () => element("h_flex");
export const v_flex = () => element("v_flex");
export const Textarea = { new: (state) => element("Textarea", [state]) };

export const TextareaState = {
  new: (options = {}) => {
    const state = {
      placeholder: options.placeholder ?? null,
      soft_wrap: false,
      text: options.value ?? "",
      handlers: {},
    };
    state.set_soft_wrap = (wrap) => { state.soft_wrap = wrap; };
    state.on = (event, cb) => { state.handlers[event] = cb; };
    state.set_value = (text) => { state.text = text; };
    state.value = () => state.text;
    return state;
  },
};

// herdr — appHome is a fixed prefix, so the pad's file lands at FILE.
export const appHome = () => "/app";
export const checking = () => host.checking;
export const settings = () => host.settings;
export const theme = () => new Proxy({}, { get: (_t, key) => (typeof key === "string" ? `theme.${key}` : undefined) });

// Null when the file is absent, like the real host.
export function readTextFile(path) {
  return Promise.resolve(host.files.has(path) ? host.files.get(path) : null);
}

// Compare-to-expected, like the real host: null expected creates or
// replaces, a stale snapshot rejects. `writeGate` parks a write mid-flight
// so a test can race the person's typing against an external writer.
export function writeTextFile(path, text, expected) {
  host.writes.push([path, text, expected]);
  const settleWrite = host.writeGate ? host.writeGate() : Promise.resolve();
  return settleWrite.then(() => {
    const current = host.files.has(path) ? host.files.get(path) : null;
    if (expected !== null && current !== expected) throw new Error(`stale snapshot: ${path}`);
    host.files.set(path, text);
    return null;
  });
}

// The watch loop's fuel: each call parks until the test fires it.
export function watchFolder(path) {
  host.watches.push(path);
  const gate = {};
  const watch = new Promise((resolve) => { gate.resolve = resolve; });
  host.gates.push(gate);
  return watch;
}

export const fireWatch = (paths = []) => {
  for (const gate of host.gates.splice(0)) gate.resolve(paths);
};

export function fakeCx() {
  const cx = { pending: [], notified: 0 };
  cx.spawn = (run) => {
    const started = run(cx);
    cx.pending.push(started);
    return started;
  };
  cx.notify = () => { cx.notified += 1; };
  return cx;
}

// Lets every spawned chain run to its next stop: each round is one microtask
// turn for every active chain, so a fast host call resolves within a few;
// a watch or a gated write simply stays parked, never awaited.
export async function settle(cx, rounds = 20) {
  cx.pending.splice(0);
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
