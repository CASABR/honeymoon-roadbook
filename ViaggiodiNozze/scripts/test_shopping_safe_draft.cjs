const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTs(relPath, deps = {}, globals = {}) {
  const src = fs.readFileSync(path.join(root, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: id => {
      if (id in deps) return deps[id];
      throw new Error('Unexpected import in ' + relPath + ': ' + id);
    },
    console, Math, Number, String, Boolean, Array, Object, Set, Map, Date, JSON, Promise, ...globals
  });
  return exports;
}

// Mock localStorage across simulated PWA close/reopen
const store = new Map();
const localStorageMock = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};

let savedItems = [];
const shoppingSave = loadTs('src/utils/shoppingSave.ts', {
  '../services/currencyService': { buildEurSavePatch: async ({ costRaw }) => ({ cost: costRaw }) },
  '../storage/storageService': {
    storageService: {
      getShopping: async () => savedItems,
      saveShopping: async item => {
        const idx = savedItems.findIndex(x => x.id === item.id);
        if (idx >= 0) savedItems[idx] = item;
        else savedItems.push(item);
      }
    }
  }
}, { localStorage: localStorageMock });

const shoppingLocalDraft = loadTs('src/utils/shoppingLocalDraft.ts', {});

function makeMemoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

const baseFields = {
  sottocategoria: 'Alimentari',
  nome: 'Supermercato',
  scopo: 'Spesa',
  data: '2026-12-10',
  orario: '18:00',
  timeStatus: 'indicativo',
  indirizzo: 'Queenstown',
  budget: '45 NZD',
  link: '',
  noteCopilota: 'Acqua e frutta',
  copilota: true
};

(async () => {
  // 1. Scoped local draft: rapid edits (100x), offline/reopen, zero cloud writes
  const scopeA = { tripId: 'synth-trip', editorId: 'owner_uid_1', entityId: 'shop_1' };
  const s1 = makeMemoryStorage();
  for (let i = 1; i <= 100; i++) {
    const res = shoppingLocalDraft.writeShoppingDraft(
      scopeA,
      { ...baseFields, nome: `Negozio ${i}` },
      { storage: s1, now: 1000 + i, sourceUpdatedAt: 900 }
    );
    assert.equal(res.ok, true);
    assert.equal(res.status, 'bozza_sul_dispositivo');
  }
  const restored = shoppingLocalDraft.readShoppingDraft(scopeA, { storage: s1, now: 2000, sourceUpdatedAt: 900 });
  assert.ok(restored);
  assert.equal(restored.conflict, false);
  assert.equal(restored.fields.nome, 'Negozio 100');
  assert.equal(savedItems.length, 0, 'Rapid draft edits must not auto-push expenses');
  console.log('PASS 1: 100 rapid synchronous draft edits & PWA reopen restore latest state without duplicates');

  // 2. Scope isolation: trip switch, user switch, card switch, 2-tab shared storage
  assert.equal(shoppingLocalDraft.readShoppingDraft({ ...scopeA, tripId: 'other-trip' }, { storage: s1, now: 2000 }), null);
  assert.equal(shoppingLocalDraft.readShoppingDraft({ ...scopeA, editorId: 'other_uid' }, { storage: s1, now: 2000 }), null);
  assert.equal(shoppingLocalDraft.readShoppingDraft({ ...scopeA, entityId: 'shop_2' }, { storage: s1, now: 2000 }), null);

  // 3. Conflict detection when shared record updated after draft, expiry (7d), broken storage & >60KB
  const conflictRead = shoppingLocalDraft.readShoppingDraft(scopeA, { storage: s1, now: 2000, sourceUpdatedAt: 5000 });
  assert.equal(conflictRead.conflict, true);
  assert.equal(shoppingLocalDraft.readShoppingDraft(scopeA, { storage: s1, now: 2000 + 31 * 86400 * 1000 }), null);

  const brokenStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const failQuota = shoppingLocalDraft.writeShoppingDraft(scopeA, baseFields, { storage: brokenStorage, now: 1000 });
  assert.equal(failQuota.ok, false);
  assert.equal(failQuota.status, 'bozza_non_salvata');

  const huge = shoppingLocalDraft.writeShoppingDraft(
    scopeA,
    { ...baseFields, noteCopilota: 'x'.repeat(70000) },
    { storage: s1, now: 1000 }
  );
  assert.equal(huge.ok, false);
  assert.equal(huge.status, 'bozza_non_salvata');
  console.log('PASS 2: Scope isolation, conflict detection, expiry, quota & >60KB error handling verified');

  // 4. Manual save updates item without duplication & clears local draft only on success
  savedItems = [{ id: 'shop_1', nome: 'Vecchio', createdAt: 100, updatedAt: 100 }];
  const { payload } = await shoppingSave.buildShoppingSavePayload({
    draft: restored.fields,
    initialData: savedItems[0]
  });
  await shoppingSave.persistExistingShoppingEdit(savedItems[0], payload);
  shoppingLocalDraft.clearShoppingDraft(scopeA, { storage: s1 });
  assert.equal(savedItems.length, 1, 'No duplicate shopping items on update');
  assert.equal(savedItems[0].nome, 'Negozio 100');
  assert.equal(shoppingLocalDraft.readShoppingDraft(scopeA, { storage: s1, now: 2000 }), null);
  console.log('PASS 3: Manual save updates item without duplication and clears local draft');

  // 5. Static safety invariants on ShoppingForm.tsx
  const formSrc = fs.readFileSync(path.join(root, 'src/components/forms/ShoppingForm.tsx'), 'utf8');
  assert.ok(!formSrc.includes('useCardAutoSave'), 'ShoppingForm must not use background cloud auto-save');
  assert.ok(!formSrc.includes('setTimeout(flushLocalDraftNow'), 'ShoppingForm must write drafts synchronously, not debounced');
  assert.ok(formSrc.includes("bozza_sul_dispositivo: { text: 'Bozza sul dispositivo'"), 'Missing Bozza sul dispositivo label');
  assert.ok(formSrc.includes("bozza_non_salvata: { text: 'Bozza non salvata: usa Salva'"), 'Missing Bozza non salvata label');
  assert.ok(formSrc.includes("saving: { text: 'Salvataggio in corso'"), 'Missing Salvataggio in corso label');
  assert.ok(formSrc.includes("saved_pending_sync: { text: 'Salvato nel viaggio; sincronizzazione da verificare'"), 'Missing saved_pending_sync label');
  assert.ok(formSrc.includes("synced: { text: '✓ Sincronizzato'"), 'Missing Sincronizzato label');
  assert.ok(formSrc.includes('writeShoppingDraft') && formSrc.includes('readShoppingDraft') && formSrc.includes('clearShoppingDraft'), 'Missing shoppingLocalDraft API usage');
  assert.ok(formSrc.includes('await onSave(payload)'), 'Missing awaited onSave');
  assert.ok(formSrc.includes('pendingConflictDraft') && formSrc.includes('Ripristina bozza') && formSrc.includes('Scarta bozza'), 'Missing manual conflict resolution');
  assert.ok(formSrc.includes('hasPendingMutation') && formSrc.includes('inFlightSubmitRef'), 'Missing strict cloud proof & single-flight submit lock');
  assert.ok(formSrc.includes('pagehide') && formSrc.includes('visibilitychange'), 'Missing PWA close/background flush');
  console.log('PASS 4: ShoppingForm synchronous draft, conflict UI, awaited onSave & strict cloud proof verified');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
