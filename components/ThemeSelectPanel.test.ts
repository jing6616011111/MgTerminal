import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ThemeSelectPanel.tsx', import.meta.url), 'utf8');

test('theme select panel uses a single ScrollArea (no nested panel content scroll)', () => {
  assert.match(source, /ScrollArea className="min-h-0 min-w-0 flex-1"/);
  assert.doesNotMatch(source, /<AsidePanelContent/);
});
