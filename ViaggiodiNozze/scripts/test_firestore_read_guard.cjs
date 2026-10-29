const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage', 'syncService.ts'), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function createSyncService(initiallyAuthorized) {
  let authorized = initiallyAuthorized;
  let getDocsCalls = 0;
  const listeners = new Map();
  const stores = new Map();
  const windowMock = {
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== listener));
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Date,
    setTimeout,
    clearTimeout,
    window: windowMock,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    Event: class Event {
      constructor(type) { this.type = type; }
    },
    exports: {},
    module: { exports: {} },
    require() {
      return {
        db: {},
        collection: (_db, ...segments) => segments.join('/'),
        doc: (_db, ...segments) => segments.join('/'),
        onSnapshot: () => () => {},
        setDoc: async () => {},
        deleteDoc: async () => {},
        getDocs: async () => {
          getDocsCalls++;
          return { docs: [] };
        },
        isCloudAuthorized: () => authorized,
        normalizeTimestamp: value => Number(value) || 0,
        STORES: {
          SETTINGS: 'settings', GIORNI: 'giorni', ATTIVITA: 'attivita', ALLOGGI: 'alloggi',
          TRASPORTI: 'trasporti', DOCUMENTI: 'documenti', TAPPE: 'tappe', RISTORANTI: 'ristoranti',
          SHOPPING: 'shopping', SPESE: 'spese', NOTE: 'note', BAGAGLI: 'bagagli'
        },
        idbGet: async (store, id) => stores.get(`${store}:${id}`),
        idbPut: async (store, data) => stores.set(`${store}:${data.id}`, data),
        idbDelete: async (store, id) => stores.delete(`${store}:${id}`),
        idbGetAll: async store => [...stores.entries()].filter(([key]) => key.startsWith(`${store}:`)).map(([, value]) => value),
        notifyDataChanged: () => {}
      };
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox);
  const sync = new sandbox.exports.SyncService('trip_test');

  return {
    sync,
    authorize() { authorized = true; },
    dispatchRole(role) {
      windowMock.dispatchEvent(new sandbox.CustomEvent('houni_cloud_role_changed', { detail: { cloudRole: role } }));
    },
    getDocsCalls: () => getDocsCalls
  };
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

(async () => {
  const authorized = createSyncService(true);
  await wait(30);
  assert.strictEqual(authorized.getDocsCalls(), 12, 'Il bootstrap autorizzato deve eseguire una sola scansione delle 12 collezioni');
  authorized.dispatchRole('owner');
  await wait(350);
  assert.strictEqual(authorized.getDocsCalls(), 12, 'La conferma ruolo non deve duplicare la scansione iniziale');
  authorized.sync.destroy();

  const delayed = createSyncService(false);
  await wait(30);
  assert.strictEqual(delayed.getDocsCalls(), 0, 'Il bootstrap non autorizzato non deve leggere le collezioni');
  delayed.authorize();
  delayed.dispatchRole('copilota');
  await wait(30);
  assert.strictEqual(delayed.getDocsCalls(), 12, 'La prima autorizzazione deve avviare una sola scansione iniziale');
  delayed.dispatchRole('copilota');
  await wait(350);
  assert.strictEqual(delayed.getDocsCalls(), 12, 'Conferme ruolo ripetute non devono avviare nuove scansioni');
  delayed.sync.destroy();

  console.log('PASS: guard letture Firestore iniziali (4/4)');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
