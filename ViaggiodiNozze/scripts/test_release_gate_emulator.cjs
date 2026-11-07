const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');

// Isolated demo project, bound to loopback. Never uses Firebase credentials or production.
const root = path.resolve(__dirname, '..');
const project = 'demo-hounigo-release-gate';
const host = 'http://127.0.0.1:8189';
const base = `${host}/v1/projects/${project}/databases/(default)/documents`;
const rulesPath = path.join(root, 'firestore.rules.lockdown');
const originalRules = fs.readFileSync(rulesPath);
const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR || path.join(os.homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');

function fields(data) {
  const value = item => Array.isArray(item) ? { arrayValue: { values: item.map(value) } }
    : typeof item === 'string' ? { stringValue: item }
      : typeof item === 'boolean' ? { booleanValue: item }
        : typeof item === 'number' ? { integerValue: String(item) }
          : { mapValue: { fields: fields(item) } };
  return Object.fromEntries(Object.entries(data).filter(([,v])=>v !== undefined).map(([k,v])=>[k,value(v)]));
}
function token(uid) {
  if (!uid) return null;
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({alg:'none',typ:'JWT'})}.${b64({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,auth_time:Math.floor(Date.now()/1000),firebase:{identities:{},sign_in_provider:uid==='anonymous-device'?'anonymous':'google.com'}})}.`;
}
async function request(method, docPath, uid, data) {
  assert.ok(base.startsWith('http://127.0.0.1:8189/'));
  const headers = { 'Content-Type':'application/json' };
  if (uid) headers.Authorization = `Bearer ${uid === 'ADMIN_EMULATOR_ONLY' ? 'owner' : token(uid)}`;
  return fetch(`${base}/${docPath}`, { method, headers, body: data ? JSON.stringify({fields:fields(data)}) : undefined, signal:AbortSignal.timeout(10000) });
}
function load(file, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root,file),'utf8').replaceAll('import.meta.env.DEV','false');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>{
    assert.ok(id in dependencies, `Unexpected dependency ${id}`);
    return dependencies[id];
  },console,structuredClone,setTimeout,...globals});
  return exports;
}

(async () => {
  assert.ok(fs.existsSync(jar), 'Firestore emulator JAR missing');
  // Do not attach to an existing emulator or overwrite another session's test data.
  const probe = await fetch(host,{signal:AbortSignal.timeout(500)}).then(()=>true,()=>false);
  assert.equal(probe,false,'Dedicated emulator port already in use');
  const emulator = spawn('java',['-Duser.language=en','-Duser.country=US','-jar',jar,'--host','127.0.0.1','--port','8189','--project_id',project,'--single_project_mode','true','--rules',rulesPath],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let logs = '';
  emulator.stdout.on('data',data=>{logs=(logs+data).slice(-12000);});
  emulator.stderr.on('data',data=>{logs=(logs+data).slice(-12000);});
  emulator.on('error',error=>{logs+=error.message;});
  try {
    let ready = false;
    for (let i=0;i<150;i++) {
      if (emulator.exitCode !== null) throw Error(logs);
      try { await fetch(host,{signal:AbortSignal.timeout(500)}); ready=true; break; } catch {}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(ready,logs);
    const seed = async (doc,data) => {
      const response=await request('PATCH',doc,'ADMIN_EMULATOR_ONLY',data);
      assert.ok(response.ok,`Emulator seed failed ${doc}: ${await response.text()}`);
    };
    // 0000 below exists ONLY in this empty demo emulator, never in the real project.
    for (const trip of ['0000','synthetic-release']) {
      await seed(`trips/${trip}`,{ownerUid:'owner-original',members:['owner-original','copilot','viewer','revoked']});
      for (const [uid,role] of [['owner-original','owner'],['copilot','copilota'],['viewer','viewer'],['revoked','copilota']]) {
        await seed(`trips/${trip}/members/${uid}`,{uid,role});
      }
      await seed(`trips/${trip}/alloggi/shared`,{id:'shared',name:'Synthetic accommodation'});
      for (const collection of ['private_credentials','documenti','spese','note']) {
        await seed(`trips/${trip}/${collection}/shared`,{id:'shared',cost:'1200',depositPaid:'300',bookingCode:'SYNTHETIC-VOUCHER'});
      }
    }
    let passed=0;
    async function check(method,doc,uid,allowed,data) {
      const response = await request(method,doc,uid,data);
      assert.equal(response.status,allowed?(method==='DELETE'?200:200):403,`${method} ${doc} as ${uid || 'unauthenticated'}: ${await response.text()}`);
      passed++;
    }
    // Revoke a previously privileged identity in both membership representations.
    await check('GET','trips/0000/private_credentials/shared','revoked',true);
    for (const trip of ['0000','synthetic-release']) {
      await seed(`trips/${trip}`,{ownerUid:'owner-original',members:['owner-original','copilot','viewer']});
      const deletion=await request('DELETE',`trips/${trip}/members/revoked`,'ADMIN_EMULATOR_ONLY');
      assert.ok(deletion.ok);
    }
    const identities = ['owner-original','copilot','viewer','anonymous-device','revoked',null];
    for (const uid of identities) {
      const privileged = uid==='owner-original' || uid==='copilot';
      const member = privileged || uid==='viewer';
      for (const trip of ['0000','synthetic-release']) {
        await check('GET',`trips/${trip}`,uid,trip==='0000'?privileged:member);
        await check('GET',`trips/${trip}/alloggi/shared`,uid,trip==='0000'?privileged:member);
        for (const collection of ['private_credentials','documenti','spese','note']) {
          await check('GET',`trips/${trip}/${collection}/shared`,uid,privileged);
          await check('PATCH',`trips/${trip}/${collection}/shared`,uid,trip!=='0000'&&privileged,{id:'shared',cost:'1200',depositPaid:'300',bookingCode:'SYNTHETIC-VOUCHER'});
          await check('DELETE',`trips/${trip}/${collection}/delete-check`,uid,trip!=='0000'&&privileged);
        }
        await check('PATCH',`trips/${trip}/alloggi/shared`,uid,trip!=='0000'&&privileged,{id:'shared',name:'Synthetic accommodation'});
        await check('DELETE',`trips/${trip}/alloggi/delete-check`,uid,trip!=='0000'&&privileged);
        await check('PATCH',`trips/${trip}/alloggi/sensitive`,uid,false,{id:'sensitive',cost:'1200',bookingCode:'SYNTHETIC-VOUCHER'});
      }
    }
    console.log(`PASS: ${passed} actual lockdown Rules checks (Owner, Copilota, Viewer, anonymous, unauthenticated, revoked; frozen and operational synthetic trips)`);

    // Execute production SyncService + authorization + queue against real emulator denials.
    const storage=new Map();
    const auth={currentUser:{uid:'anonymous-device',isAnonymous:true}};
    const navigator={onLine:true};
    const globals={navigator,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{dispatchEvent(){}},CustomEvent:class{}};
    const identity=load('src/utils/useAuthIdentity.ts',{react:{},'firebase/auth':{},'firebase/firestore':{},'../firebase':{auth,db:{}},'./tripConfig':{getTripConfig:()=>({id:'0000'})}},globals);
    const queue=load('src/storage/localMutationQueue.ts',{});
    const splitter=load('src/utils/securityDataSplitter.ts',{});
    let writeAttempts=0;
    const write=async (method,ref,data)=>{
      writeAttempts++;
      const response=await request(method,ref,auth.currentUser.uid,data);
      if (!response.ok) throw Object.assign(Error('Emulator permission-denied'),{code:'permission-denied'});
    };
    const {SyncService}=load('src/storage/syncService.ts',{
      'firebase/firestore':{doc:(_db,...parts)=>parts.join('/'),setDoc:(ref,data)=>write('PATCH',ref,data),deleteDoc:ref=>write('DELETE',ref)},
      '../firebase':{auth,db:{}},'./indexedDB':{STORES:{SETTINGS:'settings'},idbGet:async()=>null},'./storageService':{},
      '../utils/tripDates':{normalizeTimestamp:v=>Number(v)||0},'../utils/useAuthIdentity':identity,
      '../utils/tripConfig':{getTripConfig:()=>({id:'0000',ownerUid:'owner-original'})},
      '../services/pushNotificationService':{},'../utils/securityDataSplitter':splitter,'./localMutationQueue':queue
    }, globals);
    const sync=Object.create(SyncService.prototype);
    sync.tripId='0000';sync.isDestroyed=false;sync.emitSyncStatus=()=>{};
    const pending={id:'iphone-synthetic-edit',cost:'1200',depositPaid:'300',bookingCode:'SYNTHETIC-VOUCHER',attachments:[{id:'voucher',data:'preserved'}]};
    identity.setAuthoritativeCloudRole('unverified');
    await sync.pushToCloud('alloggi','save',pending,{mutationId:'iphone-edit'});
    assert.equal(writeAttempts,0,'Anonymous session must not submit pending data');
    auth.currentUser={uid:'owner-original',isAnonymous:false};
    await sync.flushPendingPushes();
    assert.equal(writeAttempts,0,'UID transition alone must not authorize writes');
    await check('GET','trips/0000',auth.currentUser.uid,true);
    identity.setAuthoritativeCloudRole('owner');
    storage.set('hounigo_allow_cloud_write_0000', 'true');
    await sync.flushPendingPushes();
    assert.equal(writeAttempts,1,'Verified Owner attempts a write; actual lockdown must deny it');
    assert.equal((await queue.getPendingMutations('0000')).length,1);
    assert.equal(JSON.stringify((await queue.getPendingMutations('0000'))[0].data),JSON.stringify(pending));
    auth.currentUser={uid:'revoked',isAnonymous:false};
    await sync.flushPendingPushes();
    assert.equal(writeAttempts,1,'Changed UID cannot reuse Owner authorization');
    navigator.onLine=false;
    assert.equal((await queue.getPendingMutations('0000')).length,1);
    console.log('PASS: synthetic iPhone pending payload survives anonymous -> Google Owner -> actual lockdown denial -> changed UID/offline, with no unauthorized write');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (emulator.exitCode===null) {
      const exited=new Promise(resolve=>emulator.once('exit',resolve));
      emulator.kill();
      await exited;
    }
    assert.deepEqual(fs.readFileSync(rulesPath),originalRules,'Rules file must remain unchanged');
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
