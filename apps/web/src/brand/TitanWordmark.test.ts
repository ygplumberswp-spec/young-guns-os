import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('TitanWordmark source is SVG-based (not plain text brand rendering)', () => {
  const source = readFileSync(join(__dirname, 'TitanWordmark.tsx'), 'utf8');
  assert.match(source, /<svg/);
  assert.match(source, /role="img"/);
  assert.match(source, /aria-label/);
  assert.match(source, /titanChromeFill|currentColor/);
  assert.match(source, /viewBox="0 0 560 88"/);
  // Open angular A (chevron, no crossbar counter cut)
  assert.match(source, /open angular|no crossbar/i);
  assert.doesNotMatch(source, />TITAN</);
  assert.doesNotMatch(source, /M256 48 H264/);
});

test('static wordmark asset exists with accessible title', () => {
  const svg = readFileSync(
    join(__dirname, '../../public/brand/titan-wordmark.svg'),
    'utf8',
  );
  assert.match(svg, /<title>TITAN<\/title>/);
  assert.match(svg, /aria-label="TITAN"/);
  assert.match(svg, /linearGradient/);
  assert.match(svg, /viewBox="0 0 560 88"/);
  assert.doesNotMatch(svg, /M256 48 H264/);
});
