/**
 * Syncs drizzle/meta/_journal.json with all SQL files in drizzle/,
 * then reports migration status. Run: node scripts/sync-journal-and-migrate.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const journalPath = join(root, 'drizzle/meta/_journal.json');

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const existingTags = new Set(journal.entries.map((e) => e.tag));
const sqlFiles = readdirSync(join(root, 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

let idx = journal.entries.length;
let when = journal.entries.at(-1)?.when ?? Date.now();

for (const file of sqlFiles) {
  const tag = file.replace(/\.sql$/, '');
  if (existingTags.has(tag)) continue;

  when += 3600000;
  journal.entries.push({
    idx,
    version: '7',
    when,
    tag,
    breakpoints: true,
  });
  existingTags.add(tag);
  idx++;
}

writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
console.log(`Journal updated: ${journal.entries.length} entries (${sqlFiles.length} SQL files)`);
