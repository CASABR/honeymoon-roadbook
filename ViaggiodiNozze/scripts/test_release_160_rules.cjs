// Run only through Firebase Emulator Suite with project demo-hounigo-160.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,query,where} = require('firebase/firestore');
const {ref,uploadBytes,getBytes,getDownloadURL,deleteObject,listAll} = require('firebase/storage');
const root = path.resolve(__dirname,'..');
let count=0;
async function check(name,fn) { await fn();console.log(`PASS ${++count}: ${name}`); }
(async()=>{
  assert.equal(process.env.GCLOUD_PROJECT,'demo-hounigo-160');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8387');
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9397');
  const env=await initializeTestEnvironment({projectId:'demo-hounigo-160',firestore:{host:'127.0.0.1',port:8387},storage:{host:'127.0.0.1',port:9397}});
  const owner=env.authenticatedContext('owner'),copilot=env.authenticatedContext('copilot'),viewer=env.authenticatedContext('viewer'),arrayOnly=env.authenticatedContext('array-only'),stranger=env.authenticatedContext('stranger'),guest=env.unauthenticatedContext();
  const trip='0000'; // Synthetic emulator data only; never production.
  const item=(ctx,col,id)=>doc(ctx.firestore(),'trips',trip,col,id);
  const live=(ctx,id)=>doc(ctx.firestore(),'live_feeds',trip,'updates',id);
  const photo=(ctx,id)=>ref(ctx.storage(),`trips/${trip}/live_photos/${id}.jpg`);
  const image=new Uint8Array([255,216,255,217]);
  const metadata={contentType:'image/jpeg'};
  try {
    await env.withSecurityRulesDisabled(async ctx=>{
      await setDoc(doc(ctx.firestore(),'trips',trip),{ownerUid:'owner',members:['owner','copilot','viewer','array-only']});
      await setDoc(doc(ctx.firestore(),'trips','legacy'),{ownerId:'owner',members:[]});
      for(const [uid,role]of [['owner','owner'],['copilot','copilota'],['viewer','viewer']])await setDoc(item(ctx,'members',uid),{uid,role});
      await setDoc(item(ctx,'alloggi','legacy-leak'),{id:'legacy-leak',name:'Synthetic',originalCost:100,exchangeRate:2});
      await setDoc(item(ctx,'alloggi','nested-leak'),{id:'nested-leak',name:'Synthetic',details:{originalCost:100}});
      await setDoc(item(ctx,'private_credentials','alloggio_clean'),{entityId:'clean',cost:'50.00',originalCost:100,originalCurrency:'AUD'});
      await setDoc(live(ctx,'legacy-leak'),{title:'Synthetic',timestamp:1,originalCost:100});
      await setDoc(item(ctx,'settings','targetBudget'),{value:{amount:100}});
    });
    await check('Owner and Copilota can read EUR vault; Viewer/stranger/guest cannot',async()=>{
      for(const c of [owner,copilot])assert.equal((await assertSucceeds(getDoc(item(c,'private_credentials','alloggio_clean')))).data().originalCost,100);
      for(const c of [viewer,arrayOnly,stranger,guest])await assertFails(getDoc(item(c,'private_credentials','alloggio_clean')));
    });
    await check('Both editors sync sanitized records and Viewer reads safe itinerary',async()=>{
      await assertSucceeds(setDoc(item(owner,'tappe','clean'),{id:'clean',title:'Synthetic',coordinate:{lat:1,lng:2},updatedAt:1,publicSchemaVersion:2}));
      await assertSucceeds(updateDoc(item(copilot,'tappe','clean'),{title:'Copilot update',updatedAt:2}));
      assert.equal((await assertSucceeds(getDoc(item(viewer,'tappe','clean')))).data().title,'Copilot update');
      assert.equal((await assertSucceeds(getDocs(query(collection(viewer.firestore(),'trips',trip,'tappe'),where('publicSchemaVersion','==',2))))).size,1);
      await assertFails(updateDoc(item(viewer,'tappe','clean'),{title:'forbidden'}));
    });
    await check('Every private key is blocked in shared writes, including legacy client metadata',async()=>{
      const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/utils/securityDataSplitter.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
      for(const key of exports.SENSITIVE_KEYS)await assertFails(setDoc(item(owner,'alloggi','attempt'),{name:'Synthetic',[key]:'private'}));
    });
    await check('Legacy top-level/nested leaks fail closed for Viewer; editors retain recovery access',async()=>{
      for(const id of ['legacy-leak','nested-leak']){
        await assertFails(getDoc(item(viewer,'alloggi',id)));
        assert.equal((await assertSucceeds(getDoc(item(owner,'alloggi',id)))).exists(),true);
      }
      await assertFails(getDocs(collection(viewer.firestore(),'trips',trip,'alloggi')));
      assert.equal((await assertSucceeds(getDocs(query(collection(viewer.firestore(),'trips',trip,'alloggi'),where('publicSchemaVersion','==',2))))).size,0);
      await assertFails(setDoc(item(owner,'alloggi','forged-marker'),{name:'Synthetic',publicSchemaVersion:2,extra:{originalCost:100}}));
      const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const token=encode({alg:'none',typ:'JWT'})+'.'+encode({sub:'owner',user_id:'owner',aud:'demo-hounigo-160',iss:'https://securetoken.google.com/demo-hounigo-160',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'google.com',identities:{}}})+'.';
      const forged=await fetch('http://127.0.0.1:8387/v1/projects/demo-hounigo-160/databases/(default)/documents/trips/0000/alloggi/forged-double',{
        method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({fields:{name:{stringValue:'Synthetic'},publicSchemaVersion:{doubleValue:2},extra:{mapValue:{fields:{originalCost:{integerValue:'100'}}}}}})
      });
      assert.equal(forged.status,403,'A double-valued schema marker must not bypass server validation');
      await assertFails(getDoc(item(viewer,'settings','targetBudget')));
    });
    await check('LIVE rejects financial payloads and Viewer writes, including reads of legacy leaks',async()=>{
      await assertFails(getDoc(live(guest,'legacy-leak')));
      await assertFails(setDoc(live(owner,'bad'),{title:'Synthetic',timestamp:1,originalCost:100}));
      await assertFails(setDoc(live(viewer,'bad'),{title:'Synthetic',timestamp:1}));
      await assertSucceeds(setDoc(live(copilot,'safe'),{title:'Synthetic',text:'Public',timestamp:1,publicSchemaVersion:2}));
      await assertSucceeds(getDoc(live(guest,'safe')));
      await assertFails(getDocs(collection(guest.firestore(),'live_feeds',trip,'updates')));
      assert.equal((await assertSucceeds(getDocs(query(collection(guest.firestore(),'live_feeds',trip,'updates'),where('publicSchemaVersion','==',2))))).size,1);
      await assertFails(setDoc(live(owner,'nested-bad'),{title:'Synthetic',timestamp:1,publicSchemaVersion:2,reactionCounts:{'❤️':{originalCost:100}}}));
    });
    await check('Storage accepts only actual Owner/Copilota, not array-only membership',async()=>{
      for(const [c,id]of [[owner,'owner'],[copilot,'copilot']])await assertSucceeds(uploadBytes(photo(c,id),image,metadata));
      for(const c of [viewer,arrayOnly,stranger,guest])await assertFails(uploadBytes(photo(c,'forbidden'),image,metadata));
      await assertSucceeds(uploadBytes(ref(owner.storage(),'trips/legacy/live_photos/owner.jpg'),image,metadata));
    });
    await check('Storage rejects overwrites, disallowed MIME, oversize and Viewer enumeration/deletion',async()=>{
      await assertFails(uploadBytes(photo(owner,'owner'),image,metadata));
      await assertFails(uploadBytes(photo(owner,'pdf'),image,{contentType:'application/pdf'}));
      await assertFails(uploadBytes(photo(owner,'large'),new Uint8Array(5*1024*1024),metadata));
      await assertFails(deleteObject(photo(viewer,'owner')));
      await assertFails(listAll(ref(viewer.storage(),`trips/${trip}/live_photos`)));
    });
    await check('Private user documents cannot be accessed by Copilota/Viewer/stranger/guest',async()=>{
      await assertSucceeds(uploadBytes(ref(owner.storage(),'users/owner/voucher.pdf'),image,{contentType:'application/pdf'}));
      await assertSucceeds(getBytes(ref(owner.storage(),'users/owner/voucher.pdf')));
      for(const c of [copilot,viewer,stranger,guest]){
        await assertFails(getBytes(ref(c.storage(),'users/owner/voucher.pdf')));
        await assertFails(getDownloadURL(ref(c.storage(),'users/owner/voucher.pdf')));
        await assertFails(uploadBytes(ref(c.storage(),'users/owner/forbidden.pdf'),image,{contentType:'application/pdf'}));
      }
    });
    await check('Deleting a LIVE object revokes the previously issued download URL',async()=>{
      const url=await getDownloadURL(photo(owner,'copilot'));
      assert.equal((await fetch(url)).status,200);
      const exports={};
      const source=fs.readFileSync(path.join(root,'src/services/liveStorageService.ts'),'utf8').replaceAll('import.meta.env.DEV','true');
      vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
        exports,require:id=>id === 'firebase/storage' ? require('firebase/storage') : {storage:copilot.storage()},console
      });
      await assert.rejects(exports.deleteLivePhoto('another-trip',url),/Revoca/);
      await assertSucceeds(exports.deleteLivePhoto(trip,url));
      assert.equal((await fetch(url)).status,404);
      await assert.rejects(getBytes(photo(guest,'copilot')),error=>error.code === 'storage/object-not-found');
    });
    await check('Revoked Copilota is denied even if its UID remains in members array',async()=>{
      await env.withSecurityRulesDisabled(ctx=>setDoc(item(ctx,'members','copilot'),{uid:'copilot',role:'viewer'}));
      await assertFails(uploadBytes(photo(copilot,'revoked'),image,metadata));
      await assertFails(getDoc(item(copilot,'private_credentials','alloggio_clean')));
    });
    await check('Trip/header/nested LIVE metadata and guestbook queries cannot disclose private fields',async()=>{
      await assertFails(updateDoc(doc(owner.firestore(),'trips',trip),{originalCost:100}));
      await assertFails(setDoc(doc(owner.firestore(),'live_feeds',trip),{title:'Synthetic',currentCity:{originalCost:100}}));
      const guestRef=doc(owner.firestore(),'live_feeds',trip,'guest_messages','safe');
      await assertSucceeds(setDoc(guestRef,{visitorId:'visitor-test',authorName:'Synthetic',message:'Public',createdAt:1,hidden:false,deleted:false,publicSchemaVersion:2}));
      await assertFails(getDocs(collection(guest.firestore(),'live_feeds',trip,'guest_messages')));
      assert.equal((await assertSucceeds(getDocs(query(collection(guest.firestore(),'live_feeds',trip,'guest_messages'),where('publicSchemaVersion','==',2),where('hidden','==',false),where('deleted','==',false))))).size,1);
      await assertFails(updateDoc(guestRef,{originalCost:100}));
      await assertSucceeds(updateDoc(guestRef,{hidden:true}));
      await assertFails(getDoc(doc(guest.firestore(),'live_feeds',trip,'guest_messages','safe')));
    });
    console.log(`All ${count} real Firestore/Storage security groups passed.`);
  } finally {await env.cleanup();}
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
