#!/usr/bin/env node
/**
 * Remove legacy "Back to …" Link/Button blocks superseded by PageHeader BackButton.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../apps/web/src/pages');

const patterns = [
  /\n\s*<Link href="[^"]+">\s*\n\s*<Button variant="(?:secondary|ghost)">Back to [^<]+<\/Button>\s*\n\s*<\/Link>/g,
  /\n\s*<Link href="[^"]+">\s*<Button variant="(?:secondary|ghost)">Back to [^<]+<\/Button>\s*<\/Link>/g,
  /\n\s*<Link href="[^"]+" className="[^"]*">\s*\n\s*Back to [^\n]+\n\s*<\/Link>/g,
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

let count = 0;
for (const file of walk(pagesDir)) {
  if (file.includes('/auth/') || file.includes('/portal/')) continue;
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  for (const pattern of patterns) {
    content = content.replace(pattern, '');
  }
  // Remove showBack prop — auto-detected now (optional cleanup)
  content = content.replace(/\s+showBack(?:={true})?/g, '');
  content = content.replace(/\s+backFallbackHref="[^"]*"/g, '');
  if (content !== original) {
    fs.writeFileSync(file, content);
    count += 1;
    console.log('cleaned', path.relative(pagesDir, file));
  }
}
console.log(`Done. Cleaned ${count} files.`);
