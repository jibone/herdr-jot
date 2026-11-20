import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { codeFiles, ROOT } from '../../tools/quality/files.mjs';
import { tool } from './kit.mjs';

const MOD = 'mods/jot';
const FORK = 'mods/tabs-jot';
const VIEW = `${MOD}/main.js`;
const FORK_VIEW = `${FORK}/main.js`;
const LIB = `${MOD}/probe.js`;
const FORK_PROBE = `${FORK}/probe.js`;

const eslint = new ESLint({ cwd: ROOT });

async function rulesFor(path, source) {
  const [result] = await eslint.lintText(source, { filePath: path });
  return result.messages.map((m) => m.ruleId);
}

const methods = (count) => Array.from({ length: count }, (_, i) => `  m${i}() { return ${i}; }\n`).join('');

test('eslint passes on the whole repo', () => {
  const run = tool('eslint', ['.']);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});

test('eslint sees every javascript file the quality checks see', () => {
  const run = tool('eslint', ['--format', 'json', '.']);
  const linted = JSON.parse(run.stdout).map((r) => r.filePath.slice(ROOT.length + 1)).sort();
  const sources = codeFiles().map((f) => f.path).sort();
  assert.deepEqual(linted, sources);
});

test('an eslint-disable comment does not switch a rule off', async () => {
  assert.ok((await rulesFor(LIB, '/* eslint-disable */\nvar x = 1;\nexport { x };\n')).includes('no-var'));
});

test('a class outside the view is refused', async () => {
  assert.ok((await rulesFor(LIB, 'export class A {}\n')).includes('no-restricted-syntax'));
  assert.ok((await rulesFor(LIB, 'export const A = class {};\n')).includes('no-restricted-syntax'));
});

test('this outside the view is refused', async () => {
  assert.ok((await rulesFor(LIB, 'export function f() { return this; }\n')).includes('no-restricted-syntax'));
});

test('each view is the one class in its file, with a bounded number of methods', async () => {
  for (const path of [VIEW, FORK_VIEW]) {
    assert.deepEqual((await rulesFor(path, `export default class V {\n${methods(12)}\n}\n`)), [], path);
    assert.ok((await rulesFor(path, `export default class V {\n${methods(13)}\n}\n`)).includes('no-restricted-syntax'), path);
  }
  assert.ok((await rulesFor(VIEW, 'export default class V {}\nexport class W {}\n')).includes('max-classes-per-file'));
});

test('functions in the mod stay short and simple', async () => {
  const long = `export function f(a) {\n${Array.from({ length: 61 }, (_, i) => `  a.push(${i});`).join('\n')}\n}\n`;
  assert.ok((await rulesFor(LIB, long)).includes('max-lines-per-function'));
  assert.ok((await rulesFor(LIB, 'export const f = (a, b, c, d, e, g) => a + b + c + d + e + g;\n')).includes('max-params'));
  assert.ok((await rulesFor(LIB, 'export const f = (a) => (a ? 1 : a === 0 ? 2 : 3);\n')).includes('no-nested-ternary'));
});

test('the fork keeps Herdr\'s shape: the size limits hold only the mod we own', async () => {
  const long = `export function f(a) {\n${Array.from({ length: 61 }, (_, i) => `  a.push(${i});`).join('\n')}\n}\n`;
  assert.deepEqual(await rulesFor(FORK_PROBE, long), []);
  assert.ok((await rulesFor(LIB, long)).includes('max-lines-per-function'));
});
