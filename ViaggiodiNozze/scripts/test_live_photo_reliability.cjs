const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
function load(file, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => {
    assert.ok(id in dependencies, 'Unexpected import: ' + id); return dependencies[id];
  }, console, TextEncoder, crypto: webcrypto, ...globals });
  return exports;
}
(async () => {
  const auth = { currentUser: { uid: 'owner-test', isAnonymous: false }, authStateReady: async () => {} };
  const records = new Map();
  let uploads = 0, writes = 0, tripId = 'trip-a', allowed = true;
  const key = (trip, id) => JSON.stringify([trip,id]);
  const pub = load('src/services/livePhotoPublication.ts', {
    '../firebase': { auth },
    '../utils/tripConfig': { getTripConfig: () => ({ id: tripId }) },
    './liveService': {
      verifyPrivilegedLivePublisher: async () => ({ isMember: allowed }),
      getStableLivePhoto: async (trip,id) => records.get(key(trip,id)) || null,
      ensureStablePhotoVisible: async () => {},
      liveService: { publishToLive: async (trip,info,_header,id) => {
        writes++; records.set(key(trip,id), { photoUrl: info.photoUrl, deleted:false }); return id;
      }}
    },
    './liveStorageService': {
      uploadLivePhoto: async () => { uploads++; await new Promise(resolve => setTimeout(resolve, 10)); return { downloadUrl: 'https://example.test/photo/'+uploads }; },
      deleteLivePhoto: async () => true
    }
  });
  const image = 'data:image/jpeg;base64,synthetic-photo';
  const args = ['trip-a', image, {title:'test'}, 'owner-test'];
  const [first, second] = await Promise.all([pub.publishLivePhotoOnce(...args), pub.publishLivePhotoOnce(...args)]);
  assert.equal(first.postId, second.postId);
  assert.equal(uploads, 1); assert.equal(writes, 1);
  assert.equal((await pub.publishLivePhotoOnce(...args)).postId, first.postId);
  assert.equal(uploads, 1); assert.equal(writes, 1);
  assert.notEqual(await pub.stableLivePhotoId(image+'2'), first.postId);
  records.set(key('trip-a',first.postId), { deleted:true, photoUrl:'' });
  await assert.rejects(() => pub.publishLivePhotoOnce(...args), /rimossa/);
  assert.equal(uploads,1);
  allowed = false;
  await assert.rejects(() => pub.publishLivePhotoOnce(...args), /Owner/);
  allowed = true; tripId = 'trip-b';
  await assert.rejects(() => pub.publishLivePhotoOnce(...args), /Sessione/);
  assert.equal(uploads,1);

  const store = new Map(), archive = new Map();
  const localStorage = {
    getItem: k => store.get(k) || null,
    setItem: (k,v) => store.set(k,v),
    removeItem: k => store.delete(k)
  };
  const journal = load('src/services/photoJournalService.ts', {
    '../firebase': { auth },
    '../utils/deviceSession': { getOrCreateDeviceId: () => 'device' },
    '../storage/storageService': { storageService: {} },
    './predeparturePhotoArchive': {
      readArchivedPredeparturePhoto: async (t,u) => archive.get(key(t,u)) || null,
      writeArchivedPredeparturePhoto: async photo => archive.set(key(photo.tripId,photo.userId), {...photo})
    }
  }, { localStorage });
  const saved = await journal.savePredeparturePhotoDurably('trip-a',image,'owner-test');
  store.delete('hounigo_live_gallery');
  assert.equal((await journal.loadPredeparturePhoto('trip-a','owner-test')).url,image);
  assert.equal(await journal.loadPredeparturePhoto('trip-b','owner-test'),null);
  assert.equal(await journal.loadPredeparturePhoto('trip-a','another-user'),null);
  const linked = await journal.linkPredeparturePhotoToLive(saved,first.postId);
  assert.equal(linked.liveUpdateId,first.postId);
  assert.equal((await journal.savePredeparturePhotoDurably('trip-a',image,'owner-test')).liveUpdateId,first.postId);
  const replaced = await journal.savePredeparturePhotoDurably('trip-a',image+'2','owner-test');
  assert.notEqual(replaced.id,saved.id); assert.equal(replaced.liveUpdateId,undefined);
  await assert.rejects(() => journal.linkPredeparturePhotoToLive(saved,'obsolete'), /cambiata/);
  console.log('PASS: concurrent and repeated photo publishing, tombstones, authorization, archive recovery and identity isolation');
})().catch(error => { console.error(error); process.exitCode=1; });
