import assert from 'node:assert/strict';
import { buildTripDiscoveryPlan, resolveVerifiedTripRole } from './src/utils/tripDiscovery.ts';

console.log('=== TEST MIRATO: RIPRISTINO DISCOVERY VIAGGI & RUOLO VIEWER ===\n');

console.log('1. Verifica resolveVerifiedTripRole:');

// 1.1 Owner diretto
assert.strictEqual(
  resolveVerifiedTripRole('uid_owner', { ownerUid: 'uid_owner' }),
  'owner',
  'Owner UID diretto deve restituire owner'
);
assert.strictEqual(
  resolveVerifiedTripRole('uid_owner', { ownerId: 'uid_owner' }),
  'owner',
  'Owner ID diretto deve restituire owner'
);

// 1.2 Membro Copilota
assert.strictEqual(
  resolveVerifiedTripRole('uid_copilota', { ownerUid: 'other' }, true, 'copilota'),
  'copilota',
  'Documento membro copilota deve restituire copilota'
);

// 1.3 Membro Viewer: CRITICO - non deve MAI restituire copilota
assert.strictEqual(
  resolveVerifiedTripRole('uid_viewer', { ownerUid: 'other' }, true, 'viewer'),
  'viewer',
  'Documento membro viewer deve restituire viewer'
);
assert.notStrictEqual(
  resolveVerifiedTripRole('uid_viewer', { ownerUid: 'other' }, true, 'viewer'),
  'copilota',
  'CRITICO: Viewer non deve mai essere interpretato come copilota'
);

// 1.4 Precedenza: Se la root trip doc contiene uid in members, ma il documento membro puntuale dice 'viewer',
// il documento membro DEVE avere la precedenza assoluta e restituire 'viewer'.
assert.strictEqual(
  resolveVerifiedTripRole('uid_viewer', { ownerUid: 'other', members: ['uid_viewer'] }, true, 'viewer'),
  'viewer',
  'Il documento membro viewer deve prevalere sull array root'
);
assert.notStrictEqual(
  resolveVerifiedTripRole('uid_viewer', { ownerUid: 'other', members: ['uid_viewer'] }, true, 'viewer'),
  'copilota',
  'CRITICO: Viewer non deve essere promosso a copilota per presenza nell array'
);

// 1.5 Ruolo non membro / revocato
assert.strictEqual(
  resolveVerifiedTripRole('uid_unknown', { ownerUid: 'other', members: ['other_copilot'] }, false),
  null,
  'Non membro deve restituire null'
);
assert.strictEqual(
  resolveVerifiedTripRole('uid_revoked', { ownerUid: 'other' }, true, 'revoked'),
  null,
  'Ruolo non valido/revocato deve restituire null'
);

console.log('  ✓ Tutti i casi di ruolo (Owner, Copilota, Viewer, Non-membro) validati con successo.');

// 2. Test Discovery Plan e candidati locali
console.log('\n2. Verifica buildTripDiscoveryPlan e inclusione 0000:');

const plan1 = buildTripDiscoveryPlan(['trip_l96ccua'], 'trip_l96ccua', ['0000', 'trip_l96ccua']);
assert.deepStrictEqual(plan1.uniqueTripIds.sort(), ['0000', 'trip_l96ccua'].sort());
assert.ok(plan1.uniqueTripIds.includes('0000'), '0000 deve essere presente nei candidati unici');

const planEmptyIndex = buildTripDiscoveryPlan([], null, ['0000']);
assert.deepStrictEqual(planEmptyIndex.uniqueTripIds, ['0000']);

console.log('  ✓ Inclusione e deduplicazione candidate IDs validata.');

// 3. Simulazione scenari Giusy
console.log('\n3. Simulazione scenari Giusy:');

// Scenario A: Giusy UID Anonimo (JwPdCVGo1mPpaKXxkoJCVnIqmco2)
const anonUid = 'JwPdCVGo1mPpaKXxkoJCVnIqmco2';
const mockTrip0000 = {
  id: '0000',
  title: 'Viaggio Originale',
  ownerUid: 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2' // Nunzio
};
const mockTripGiappone = {
  id: 'trip_l96ccua',
  title: 'Giappone',
  ownerUid: anonUid // Giusy
};

// Verifica 0000 per UID anonimo con documento membro copilota
const role0000Anon = resolveVerifiedTripRole(anonUid, mockTrip0000, true, 'copilota');
assert.strictEqual(role0000Anon, 'copilota', 'UID anonimo di Giusy deve essere riconosciuto Copilota in 0000');

// Verifica Giappone per UID anonimo come owner
const roleGiapponeAnon = resolveVerifiedTripRole(anonUid, mockTripGiappone, false);
assert.strictEqual(roleGiapponeAnon, 'owner', 'UID anonimo di Giusy deve essere riconosciuto Owner in Giappone');

console.log('  ✓ Scenario UID Anonimo: Riconosce Giappone (Owner) E 0000 (Copilota).');

// Scenario B: Giusy Google UID (EY8lnbnfy7gbES6tijrTfjlJzjS2) prima dell autorizzazione Owner
const googleUid = 'EY8lnbnfy7gbES6tijrTfjlJzjS2';

// 0000 non autorizzato per Google UID
const role0000Google = resolveVerifiedTripRole(googleUid, mockTrip0000, false);
assert.strictEqual(role0000Google, null, 'Google UID non autorizzato NON deve accedere a 0000');

// Giappone non autorizzato per Google UID
const roleGiapponeGoogle = resolveVerifiedTripRole(googleUid, mockTripGiappone, false);
assert.strictEqual(roleGiapponeGoogle, null, 'Google UID non autorizzato NON deve accedere a Giappone');

console.log('  ✓ Scenario Google UID pre-autorizzazione: Nessun accesso improprio, sicurezza garantita.');

// Scenario C: Giusy Google UID dopo che l Owner l ha autorizzato
const role0000GoogleAfter = resolveVerifiedTripRole(googleUid, mockTrip0000, true, 'copilota');
assert.strictEqual(role0000GoogleAfter, 'copilota', 'Google UID autorizzato dall Owner viene riconosciuto come Copilota');

console.log('  ✓ Scenario Google UID post-autorizzazione: Riconosciuto correttamente come Copilota.');

console.log('\n=== ESITO: TUTTI I CONTROLLI HANNO DATO ESITO PASS ===\n');

