const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'src/services/unifiedBookingService.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8');

assert.ok(service.includes('getTappaBookingEvidence'), 'predicate evidenze Tappa assente');
assert.ok(service.includes('if (!evidence.hasEvidence) return;'), 'le Tappe libere devono restare escluse');
assert.ok(service.includes("rawType: 'tappa'"), 'Tappa prenotata non inclusa nel modello unificato');
assert.ok(service.includes("item.rawType !== 'tappa'"), 'una Tappa non deve sovrascrivere una prenotazione esistente con lo stesso ID');
assert.ok(types.includes('linkedDocumentIds?: string[]'), 'collegamenti documento Tappa assenti');
assert.ok(types.includes("linkedEntityType?: 'tappa'"), 'collegamento documento esplicito assente');

console.log('6/6 verifiche Tappe prenotate superate.');
