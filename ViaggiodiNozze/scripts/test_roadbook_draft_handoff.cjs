const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/roadbookDraftHandoff.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: exportsObject, TextDecoder, Uint8Array });
const { decodeRoadbookDraft, mayOpenRoadbookDraft } = exportsObject;
const make = payload => '#hounigo-draft=' + Buffer.from(JSON.stringify(payload)).toString('hex');
const payload = { schema: 1, tripId: 'synthetic-trip', text: 'Proposta: visita alle 15:30, città e caffè.' };
const decoded = decodeRoadbookDraft(make(payload));
assert.equal(JSON.stringify(decoded), JSON.stringify(payload));
for (const invalid of ['#live', '#hounigo-draft=abc', '#hounigo-draft=zz', make({...payload, schema:2}),
  make({...payload, tripId:'../other'}), make({...payload, text:''}), make({...payload, text:'a'.repeat(4097)}),
  make({...payload, operation:'delete'}), make({...payload, text: ['not-text']})]) assert.equal(decodeRoadbookDraft(invalid), null);
const session = { authenticated:true, external:false, admin:false, simulated:false, tripId:'synthetic-trip',
  role:'owner', uid:'test-user', authUid:'test-user', anonymous:false };
assert.equal(mayOpenRoadbookDraft(decoded, session), true);
assert.equal(mayOpenRoadbookDraft(decoded, {...session, role:'copilota'}), true);
for (const change of [{ authenticated:false }, { external:true }, { admin:true }, { simulated:true },
  { tripId:'other' }, { role:'viewer' }, { uid:null }, { authUid:'other' }, { anonymous:true }]) {
  assert.equal(mayOpenRoadbookDraft(decoded, {...session,...change}), false);
}
const app = fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8');
const modal = fs.readFileSync(path.join(__dirname,'../src/components/modals/SmartInsertModal.tsx'),'utf8');
assert.match(app, /initialDraftText=\{roadbookDraftText\}/);
assert.match(modal, /setText\(initialDraftText\)/);
const handoff = app.slice(app.indexOf('const openDraft = () =>'), app.indexOf('window.addEventListener(\'hashchange\', openDraft)'));
assert.doesNotMatch(handoff, /fetch\(|setDoc\(|writeBatch\(|storageService\.|handleSave\(|handleExtract\(/);
console.log('PASS: local draft decoding, verified role and trip scope, no automatic network or writes');
