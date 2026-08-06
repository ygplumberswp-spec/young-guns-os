#!/usr/bin/env node
/**
 * Phase J-6.6B — replace legacy cyan/teal Tailwind utilities with Young Guns token classes.
 * Longest patterns first to avoid partial replacements.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
  path.join(repoRoot, 'apps/web/src'),
];

const replacements = [
  [
    'rounded-md border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-100',
    'yg-info-banner rounded-md px-3 py-2 text-sm',
  ],
  [
    'border-cyan-500/40 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-100',
    'yg-info-banner px-3 py-2 text-sm',
  ],
  ['border-cyan-500/40 bg-cyan-950/20 text-cyan-100', 'yg-panel-accent'],
  ['border-cyan-500/30 bg-cyan-950/20 text-cyan-100', 'yg-panel-accent'],
  [
    'rounded-md bg-cyan-700/40 px-3 py-1.5 text-sm text-cyan-100 ring-1 ring-cyan-500/50',
    'yg-tab-active rounded-md px-3 py-1.5 text-sm',
  ],
  ['bg-cyan-700/40 text-cyan-100 ring-1 ring-cyan-500/50', 'yg-tab-active'],
  ['bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40', 'yg-tab-active'],
  ['bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40', 'yg-tab-active'],
  ['border-cyan-500/50 bg-cyan-500/10 text-cyan-200', 'yg-tab-active'],
  ['bg-cyan-600 text-white', 'yg-tab-active'],
  ['border-cyan-900/50 bg-slate-950/80 text-sm text-slate-300', 'yg-panel-muted text-sm text-slate-300'],
  ['rounded border border-cyan-500/20 bg-slate-950/70 p-3', 'yg-card-accent rounded p-3'],
  ['border border-cyan-500/20 bg-zinc-950/60 space-y-2', 'yg-card-accent space-y-2'],
  ['border border-cyan-500/20 bg-zinc-950/60 space-y-1', 'yg-card-accent space-y-1'],
  [
    'block rounded border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-cyan-500/40',
    'yg-card-accent block rounded px-3 py-2',
  ],
  ['text-xs uppercase tracking-wide text-cyan-300/80', 'yg-label-accent'],
  ['text-xs uppercase text-cyan-300/80', 'yg-label-accent'],
  ['mt-2 text-xs text-cyan-300/80', 'mt-2 yg-text-accent-subtle text-xs'],
  ['text-sm text-cyan-300/80', 'text-sm yg-text-accent-subtle'],
  ['text-xs text-cyan-300/80', 'text-xs yg-text-accent-subtle'],
  ['text-cyan-300/90', 'yg-text-accent-subtle'],
  ['text-cyan-300/80', 'yg-text-accent-subtle'],
  ['font-medium text-cyan-100 hover:underline', 'yg-link font-medium'],
  ['font-medium text-cyan-100', 'font-medium yg-text-accent-muted'],
  ['text-sm font-medium text-cyan-200', 'text-sm font-medium yg-text-accent-soft'],
  ['inline-block text-sm text-cyan-300 hover:underline', 'yg-link text-sm inline-block'],
  ['mt-2 inline-block text-sm text-cyan-300 hover:underline', 'mt-2 yg-link text-sm inline-block'],
  ['mt-1 inline-block text-xs text-cyan-300 hover:underline', 'mt-1 yg-link text-xs inline-block'],
  ['mt-2 inline-block text-cyan-300 hover:underline', 'mt-2 yg-link inline-block'],
  ['text-cyan-300 hover:underline', 'yg-link'],
  ['text-cyan-400 hover:underline', 'yg-link'],
  ['text-cyan-400', 'yg-text-accent'],
  ['text-sm text-cyan-200', 'text-sm yg-text-accent-soft'],
  ['text-cyan-200', 'yg-text-accent-soft'],
  ['text-cyan-100', 'yg-text-accent-muted'],
  ['text-cyan-300', 'yg-text-accent'],
  ['hover:border-cyan-500/40', 'hover:border-[color:var(--yg-blue-primary)]/40'],
  ['rounded bg-zinc-800 px-2 py-0.5 text-xs text-cyan-200', 'rounded bg-zinc-800 px-2 py-0.5 text-xs yg-text-accent-soft'],
  ['text-xs text-cyan-300 hover:underline', 'yg-link text-xs'],
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(tsx|ts|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

let totalFiles = 0;
let totalReplacements = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    if (file.includes('.test.') || file.includes('young-guns-theme.test')) continue;
    let content = fs.readFileSync(file, 'utf8');
    const original = content;
    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        const count = content.split(from).length - 1;
        content = content.split(from).join(to);
        totalReplacements += count;
      }
    }
    if (content !== original) {
      fs.writeFileSync(file, content);
      totalFiles += 1;
      console.log('updated:', path.relative(repoRoot, file));
    }
  }
}

console.log(`Done: ${totalReplacements} replacements across ${totalFiles} files`);
