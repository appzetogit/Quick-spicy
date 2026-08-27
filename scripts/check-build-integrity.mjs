#!/usr/bin/env node
/**
 * Fail the build if obfuscated code has been injected into tracked source.
 *
 * This repository has had an obfuscated payload appended to frontend/vite.config.js
 * three separate times. Each time it arrived the same way: a single enormous line
 * tacked onto the end of a config file, padded with whitespace so it sits off-screen
 * in a normal diff view, under an innocuous commit message. It reached the production
 * server at least once.
 *
 * Nothing in the pipeline looked. There is no CI, no hooks, and a reviewer scrolling a
 * diff will not see column 900 of a minified line. This script is that missing check.
 *
 * It scans TRACKED SOURCE ONLY - build output and dependencies are legitimately
 * minified and would drown the signal.
 *
 * Exit codes: 0 clean, 1 findings, 2 could not run.
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// Files where an injection is both most likely and most damaging: anything executed by
// the build, the package manager, or the server at startup.
const HIGH_RISK = [
  /(^|\/)vite\.config\.[cm]?js$/,
  /(^|\/)next\.config\.[cm]?js$/,
  /(^|\/)webpack\.config\.[cm]?js$/,
  /(^|\/)rollup\.config\.[cm]?js$/,
  /(^|\/)tailwind\.config\.[cm]?js$/,
  /(^|\/)postcss\.config\.[cm]?js$/,
  /(^|\/)ecosystem\.config\.[cm]?js$/,
  /(^|\/)server\.js$/,
  /(^|\/)package\.json$/,
];

// Never scanned: legitimately minified or vendored.
const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.min\.(js|css)$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp3|mp4|pdf)$/i,
];

// A single line this long in hand-written source is not hand-written.
const MAX_LINE = 2000;

// Hex-mangled identifiers are the signature of every common JS obfuscator.
// Two or three can occur by chance in a minified vendor snippet; forty cannot.
const OBFUSCATED_IDENT = /_0x[0-9a-f]{4,8}/g;
const OBFUSCATED_IDENT_THRESHOLD = 20;

const SUSPICIOUS_PATTERNS = [
  { name: "eval of obfuscated value", re: /eval\s*\(\s*_0x[0-9a-f]{4,8}/ },
  { name: "atob of obfuscated value", re: /atob\s*\(\s*_0x[0-9a-f]{4,8}/ },
  { name: "Function constructor on obfuscated value", re: /Function\s*\(\s*_0x[0-9a-f]{4,8}/ },
  // The marker carried by the payload found in this repo.
  { name: "known payload marker", re: /global\.i\s*=\s*["'][A-Z0-9-]{4,}["']/ },
];

const isSkipped = (f) => SKIP.some((re) => re.test(f));
const isHighRisk = (f) => HIGH_RISK.some((re) => re.test(f));

// --strict is used in CI, where git is always present and an inability to scan should
// fail the job. It is deliberately NOT used by the prebuild hook: some build sandboxes
// hand over a source tree without a .git directory, and a hosting provider's deploy must
// not break because the scanner could not enumerate files.
const STRICT = process.argv.includes("--strict");

// Resolve paths relative to the repo root, not the working directory - the prebuild hook
// runs from frontend/ while the script lives in scripts/.
let repoRoot = process.cwd();
let files;
try {
  repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  files = execSync("git ls-files", { encoding: "utf8", cwd: repoRoot })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !isSkipped(f));
} catch (error) {
  const message = `check-build-integrity: could not list tracked files - ${error.message}`;
  if (STRICT) {
    console.error(message);
    process.exit(2);
  }
  console.warn(`${message}\ncheck-build-integrity: SKIPPED (no git available here). CI still enforces this.`);
  process.exit(0);
}

const findings = [];

for (const file of files) {
  let content;
  try {
    const abs = `${repoRoot}/${file}`;
    if (statSync(abs).size > 5 * 1024 * 1024) continue;
    content = readFileSync(abs, "utf8");
  } catch {
    continue; // unreadable or binary
  }

  const identCount = (content.match(OBFUSCATED_IDENT) || []).length;
  if (identCount >= OBFUSCATED_IDENT_THRESHOLD) {
    findings.push({ file, issue: `${identCount} hex-mangled identifiers (_0x...)` });
  }

  for (const { name, re } of SUSPICIOUS_PATTERNS) {
    if (re.test(content)) findings.push({ file, issue: name });
  }

  // Long-line check is limited to high-risk files: a stray long line in ordinary
  // source is untidy, but in a config file it is how this payload hid.
  if (isHighRisk(file)) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.length > MAX_LINE) {
        findings.push({ file, issue: `line ${i + 1} is ${line.length} chars (limit ${MAX_LINE})` });
      }
      // Trailing whitespace long enough to push content off-screen is how the payload
      // was concealed even after a partial cleanup.
      const trailing = line.length - line.trimEnd().length;
      if (trailing > 100) {
        findings.push({ file, issue: `line ${i + 1} has ${trailing} chars of trailing whitespace` });
      }
    });
  }
}

if (findings.length === 0) {
  console.log(`check-build-integrity: clean (${files.length} tracked files scanned)`);
  process.exit(0);
}

console.error("\ncheck-build-integrity: FAILED\n");
for (const { file, issue } of findings) {
  console.error(`  ${file}\n    -> ${issue}`);
}
console.error(
  "\nThis usually means obfuscated code was injected into tracked source.\n" +
  "Inspect the file before doing anything else - do not merge, and do not deploy.\n"
);
process.exit(1);
