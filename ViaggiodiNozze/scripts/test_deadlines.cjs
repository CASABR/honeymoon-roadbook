const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const types = read('src/types/index.ts');
const storage = read('src/storage/storageService.ts');
const view = read('src/views/altro/ScadenzeView.tsx');
const today = read('src/views/OggiView.tsx');
const more = read('src/views/AltroView.tsx');
const rules = read('firestore.rules');

const checks = [
  ['modello completo', /interface Scadenza/.test(types) && /reminderMinutesBefore/.test(types) && /copilotNotes/.test(types)],
  ['stati richiesti', /'da_fare' \| 'in_attesa' \| 'completata' \| 'scaduta'/.test(types)],
  ['raccolta autorizzata riusata', /recordKind: 'scadenza'/.test(storage) && /notifyDataChanged\('note'/.test(storage)],
  ['tombstone preservati', /recordTombstone\('note', id\)/.test(storage) && /validateSaveAgainstTombstone\('note'/.test(storage)],
  ['permessi Owner Copilota preservati', /assertCanMutate\('note'\)/.test(storage)],
  ['accesso da Oggi', /'altro', undefined, 'scadenze'/.test(today)],
  ['accesso da Altro', /activeSubView === 'scadenze'/.test(more)],
  ['nessun RouteBadge nelle scadenze', !view.includes('RouteBadge')],
  ['data non verificata esplicita', /Da verificare/.test(view) && /dateVerified/.test(view)],
  ['link e note copilota', /externalUrl/.test(view) && /linkedEntityId/.test(types) && /Note copilota/.test(view)],
  ['nessuna nuova regola Firestore', !rules.includes("'scadenze'")]
];

for (const [label, passed] of checks) {
  assert.equal(passed, true, label);
  process.stdout.write(`PASS ${label}\n`);
}

process.stdout.write(`${checks.length}/${checks.length} verifiche scadenze superate\n`);
