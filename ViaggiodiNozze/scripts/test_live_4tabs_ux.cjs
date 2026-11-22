const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const editorialSrc = fs.readFileSync(path.join(root, 'src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

assert.ok(editorialSrc.includes("id: 'mappa', icon: '📍', label: 'Mappa'"), 'Missing Mappa tab with icon+label');
assert.ok(editorialSrc.includes("id: 'foto', icon: '📷', label: 'Foto'"), 'Missing Foto tab with icon+label');
assert.ok(editorialSrc.includes("id: 'diario', icon: '📖', label: 'Diario'"), 'Missing Diario tab with icon+label');
assert.ok(editorialSrc.includes("id: 'messaggi', icon: '💬', label: 'Messaggi'"), 'Missing Messaggi tab with icon+label');
assert.ok(editorialSrc.includes('role="tablist"') && editorialSrc.includes('role="tab"') && editorialSrc.includes('aria-selected={isActive}'), 'Missing accessible tablist/tab attributes');
assert.ok(editorialSrc.includes('data-testid="live-latest-photo-trigger"'), 'Missing clickable latest photo trigger');
assert.ok(editorialSrc.includes('data-testid="live-open-gallery-btn"'), 'Missing explicit gallery button');
assert.ok(editorialSrc.includes('data-testid={`live-tab-dot-${tab.id}`}'), 'Missing novelty dot testid');
assert.ok(editorialSrc.includes('markTabSeen(tab)'), 'Missing markTabSeen on tab selection');
assert.ok(editorialSrc.includes('env(safe-area-inset-bottom'), 'Missing iPhone safe-area bottom inset');
assert.ok(cssSrc.includes('.hounigo-live-tab-dot') && cssSrc.includes('@media (prefers-reduced-motion: reduce)'), 'Missing reduced-motion handling for tab dot pulse');
console.log('PASS: LIVE 4-tab UX contract (tabs, icons+labels, latest photo gallery, novelty dot + read state, safe-area & reduced-motion)');
