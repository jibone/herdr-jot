import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

// The repo root, whatever folder the gate runs from.
export const ROOT = join(import.meta.dirname, '..', '..');

const FIXTURES = /(^|\/)fixtures\//;

const isFile = (root, path) => {
  try { return statSync(join(root, path)).isFile(); } catch { return false; }
};

// Every file git knows — tracked or new but not ignored — so the gate reads
// the same files a clone would carry.
export function gitFiles(root = ROOT) {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(out.split('\0').filter(Boolean))]
    .filter((path) => !path.startsWith('node_modules/') && !FIXTURES.test(path) && isFile(root, path));
}

// The code the quality checks read: this repo is JavaScript only.
export function codeFiles(root = ROOT) {
  return gitFiles(root)
    .filter((path) => /\.m?js$/.test(path))
    .map((path) => ({ path, lang: 'javascript' }));
}
