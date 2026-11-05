const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const storageSrc = fs.readFileSync(path.join(repoRoot, 'src/storage/storageService.ts'), 'utf8');
const detailSrc = fs.readFileSync(path.join(repoRoot, 'src/components/modals/TimelineItemDetailModal.tsx'), 'utf8');

console.log('--- TEST REGRESSIONE SEMANTICA STEP 1 ---');

// 1. notes e noteCopilota non si sovrascrivono
assert.ok(
  !storageSrc.includes('notes: unifiedNotes'),
  'FAIL: notes non deve essere sovrascritto da unifiedNotes'
);
assert.ok(
  storageSrc.includes('noteCopilota: cleanCopilot') && storageSrc.includes('notes: cleanNotes'),
  'PASS: noteCopilota e notes sono rigorosamente distinti in storageService'
);

// 2. TimelineItemDetailModal non fa fallback di copilota su note generiche
assert.ok(
  !detailSrc.includes('rawCopilotNotes = (\n    item.noteCopilota ||\n    (data as any)?.noteCopilota ||\n    (data as any)?.notes'),
  'FAIL: il retro delle card non deve confondere note generiche con note copilota'
);

// 3. Cauzione alloggio (deposit) distinta dall\'acconto (depositPaid)
assert.ok(
  storageSrc.includes('deposit: acc.deposit'),
  'FAIL: deposit (cauzione) deve rimanere distinta e preservata'
);

// 4. Budget e costo spesa in Shopping non si sovrascrivono
assert.ok(
  storageSrc.includes('budget: (s.budget || \'\').trim() || undefined') &&
  storageSrc.includes('costo: (s as any).costo !== undefined'),
  'FAIL: budget (previsione) e costo (spesa effettiva) devono restare distinti in shopping'
);

console.log('TUTTI I 4 CONTROLLI DI PRESERVAZIONE SEMANTICA SUPERATI CON SUCCESSO!');
