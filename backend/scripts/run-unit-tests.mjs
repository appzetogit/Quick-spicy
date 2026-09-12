/**
 * Runs the backend unit tests.
 *
 * `node --test` on its own also matches Node's default `test-*.js` pattern, which sweeps
 * in scripts/test-eta-system.js and scripts/test-delivery-order-flow.js. Those are manual
 * end-to-end tools needing a live server and database - they are documented in
 * scripts/README-DELIVERY-TEST.md and modules/order/ETA_INTEGRATION_CHECKLIST.md, and
 * under `npm test` they each ran for 38 seconds and failed. That is not what a unit test
 * run should mean, so discovery here is narrowed to `*.test.js` / `*.test.mjs` only.
 *
 * Directory arguments to --test are not portable (they fail outright on Node 24), so the
 * files are collected here and passed explicitly. New test files are picked up with no
 * change to this file.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', 'uploads', 'dist', 'logs']);
const isTestFile = (name) => /\.test\.m?js$/.test(name);

const found = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
    } else if (isTestFile(entry.name)) {
      found.push(relative(ROOT, join(dir, entry.name)));
    }
  }
})(ROOT);

if (found.length === 0) {
  console.error('No test files found - expected at least one *.test.js');
  process.exit(1);
}

console.log(`running ${found.length} test file(s)`);
const result = spawnSync(process.execPath, ['--test', ...found], { cwd: ROOT, stdio: 'inherit' });
process.exit(result.status ?? 1);
