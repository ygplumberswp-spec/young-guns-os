import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('button component exposes brand foundation variants', () => {
  const source = readFileSync(join(__dirname, 'button.tsx'), 'utf8');
  for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'destructive']) {
    assert.match(source, new RegExp(`'${variant}'`));
  }
});

test('styles define semantic tokens and button variants', () => {
  const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
  assert.match(tokens, /--titan-bg:/);
  assert.match(tokens, /--titan-accent:/);
  assert.match(tokens, /--titan-focus:/);
  assert.match(tokens, /prefers-reduced-motion/);

  const styles = readFileSync(join(__dirname, 'styles.css'), 'utf8');
  for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'destructive']) {
    assert.match(styles, new RegExp(`\\.titan-btn--${variant}`));
  }
  assert.match(styles, /--titan-focus-ring/);
});
