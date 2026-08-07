#!/usr/bin/env node
/**
 * One-off codemod: migrate PageHeader from @titan/ui to apps/web components/ux.
 * Run from repo root: node scripts/migrate-page-header-imports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const webSrc = path.join(repoRoot, 'apps/web/src');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'components') continue;
      walk(full, files);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function relativeUxImport(fromFile) {
  const fromDir = path.dirname(fromFile);
  const target = path.join(webSrc, 'components/ux');
  let rel = path.relative(fromDir, target).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('PageHeader')) return false;
  if (filePath.includes(`${path.sep}components${path.sep}ux${path.sep}PageHeader.tsx`)) {
    return false;
  }

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@titan\/ui['"];?/g;
  let changed = false;
  let needsUxImport = false;

  content = content.replace(importRegex, (full, specifiersRaw) => {
    const specifiers = specifiersRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const hasPageHeader = specifiers.some((s) => s === 'PageHeader' || s.startsWith('PageHeader '));
    if (!hasPageHeader) return full;

    const remaining = specifiers.filter((s) => !s.startsWith('PageHeader'));
    needsUxImport = true;
    changed = true;

    if (remaining.length === 0) {
      return '';
    }
    return `import { ${remaining.join(', ')} } from '@titan/ui';`;
  });

  if (!needsUxImport) return false;

  const uxPath = relativeUxImport(filePath);
  const uxImport = `import { PageHeader } from '${uxPath}';`;

  if (content.includes(uxImport) || content.includes("from '../../components/ux'")) {
    // may already import other ux components — merge if needed
    const uxBarrel = content.match(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]*components\/ux['"];?/);
    if (uxBarrel && !uxBarrel[1].includes('PageHeader')) {
      content = content.replace(uxBarrel[0], (line) =>
        line.replace('{', '{ PageHeader, ').replace('{ PageHeader,  ', '{ PageHeader, '),
      );
    } else if (!content.includes('PageHeader } from')) {
      content = uxImport + '\n' + content;
    }
  } else {
    content = uxImport + '\n' + content;
  }

  content = content.replace(/\n{3,}/g, '\n\n');
  if (changed) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = walk(webSrc);
let count = 0;
for (const file of files) {
  if (migrateFile(file)) {
    count += 1;
    console.log('migrated', path.relative(repoRoot, file));
  }
}
console.log(`Done. Migrated ${count} files.`);
