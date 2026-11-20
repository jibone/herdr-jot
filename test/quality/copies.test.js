import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../tools/quality/files.mjs';
import { tool } from './kit.mjs';

function clones(cwd, dirs) {
  const out = mkdtempSync(join(tmpdir(), 'jscpd-'));
  try {
    tool('jscpd', ['--config', join(ROOT, '.jscpd.json'), '--output', out, ...dirs], { cwd });
    return JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8')).duplicates;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const describe = (d) => `${d.firstFile.name}:${d.firstFile.start}-${d.firstFile.end} = ${d.secondFile.name}:${d.secondFile.start}-${d.secondFile.end}`;

// The fork is left out (.jscpd.json ignores it): its padButton mirrors the
// shipped panelButton on purpose, and its code is Herdr's, not ours.
test('no copied code: a repeat becomes one shared function', () => {
  assert.deepEqual(clones(ROOT, ['mods', 'tools', 'test']).map(describe), []);
});

const lines = (make) => `${Array.from({ length: 12 }, (_, i) => make(i)).join('\n')}\n`;
const KINDS = {
  'probe.js': lines((i) => `export function f${i}(a, b) { const x = a * ${i} + b; return x > ${i} ? x - ${i} : x + ${i}; }`),
  'probe.mjs': lines((i) => `export function g${i}(a, b) { const y = a * ${i} - b; return y > ${i} ? y - ${i} : y + ${i}; }`),
};

test('the copy check reads every kind of code file the other checks read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jscpd-kinds-'));
  try {
    for (const [name, text] of Object.entries(KINDS)) {
      for (const copy of ['a', 'b']) {
        mkdirSync(join(dir, copy), { recursive: true });
        writeFileSync(join(dir, copy, name), text);
      }
    }
    copyFileSync(join(ROOT, '.jscpd.json'), join(dir, '.jscpd.json'));
    const found = new Set(clones(dir, ['a', 'b']).map((d) => d.firstFile.name.split('/').pop()));
    assert.deepEqual([...found].sort(), Object.keys(KINDS).sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
