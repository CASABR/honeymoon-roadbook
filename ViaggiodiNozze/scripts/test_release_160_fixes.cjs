const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, globals = {}, dev = false) {
  const exports = {};
  const source = fs.readFileSync(path.join(root,file),'utf8').replaceAll('import.meta.env.DEV',String(dev));
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:id=>{assert.ok(id in dependencies, `Unexpected import ${id}`);return dependencies[id];},console,Date,AbortController,setTimeout,clearTimeout,Blob,atob,...globals});
  return exports;
}
let passed = 0;
async function test(name, fn) { await fn(); console.log(`PASS ${++passed}: ${name}`); }
(async()=>{
  const rates={AUD:2,USD:1.25,NZD:2.5};
  let calls=0;
  const currency=load('src/services/currencyService.ts',{}, {fetch:async url=>{calls++;const code=new URL(url).searchParams.get('to');return {ok:true,json:async()=>({date:'2026-11-10',rates:{[code]:rates[code]}})};}});
  const prices=load('src/utils/priceHelper.ts',{'../services/currencyService':currency});
  const security=load('src/utils/securityDataSplitter.ts');
  await test('EUR cost/AUD deposit retain EUR cost and convert deposit independently',async()=>{
    const x=await currency.buildEurSavePatch({costRaw:'100 EUR',depositRaw:'20 AUD'});
    assert.equal(x.cost,'100.00');assert.equal(x.depositPaid,'10.00');assert.equal(x.originalCurrency,'EUR');assert.equal(x.originalDepositCurrency,'AUD');
    assert.equal(prices.resolvePaymentInfo(x).remainingNum,90);
  });
  await test('AUD cost/USD deposit use two actual quotes and preserve originals',async()=>{
    const x=await currency.buildEurSavePatch({costRaw:'100 AUD',depositRaw:'20 USD'});
    assert.equal(x.cost,'50.00');assert.equal(x.depositPaid,'16.00');assert.equal(x.originalCost,100);assert.equal(x.originalDepositPaid,20);
    assert.equal(x.depositExchangeRate,1.25);assert.equal(prices.resolvePaymentInfo(x).remainingNum,34);
  });
  await test('AUD cost/EUR deposit is not re-converted',async()=>{
    const x=await currency.buildEurSavePatch({costRaw:'100 AUD',depositRaw:'20 EUR'});
    assert.equal(x.cost,'50.00');assert.equal(x.depositPaid,'20.00');
  });
  await test('Package included, free and missing cost retain distinct meanings',async()=>{
    const included=await currency.buildEurSavePatch({costRaw:'Incluso nel pacchetto'});
    assert.equal(prices.resolvePaymentInfo(included).isPackageIncluded,true);
    assert.equal(prices.resolvePaymentInfo(included).isFree,false);
    assert.equal(prices.resolvePaymentInfo({...included,packageIncluded:false}).isPackageIncluded,true);
    assert.equal(prices.resolvePaymentInfo(await currency.buildEurSavePatch({costRaw:'Gratuito'})).isFree,true);
    assert.equal(prices.resolvePaymentInfo(await currency.buildEurSavePatch({})).isFree,false);
  });
  await test('Re-saving converted EUR values offline preserves exact amounts/provenance without fetch',async()=>{
    const existing=await currency.buildEurSavePatch({costRaw:'100 AUD',depositRaw:'20 USD'});
    const before=calls;
    const saved=await currency.buildEurSavePatch({costRaw:existing.cost,depositRaw:existing.depositPaid,existingItem:existing});
    assert.equal(calls,before);assert.equal(saved.cost,'50.00');assert.equal(saved.depositPaid,'16.00');
    assert.equal(saved.originalCost,100);assert.equal(saved.originalDepositPaid,20);assert.equal(saved.originalDepositCurrency,'USD');
    const override=await currency.buildEurSavePatch({costRaw:'55 EUR',depositRaw:'17 EUR',existingItem:existing});
    assert.equal(override.originalCost,100);assert.equal(override.originalDepositPaid,20);assert.equal(override.conversionType,'definitiva');
  });
  await test('Offline without cache keeps originals unresolved and out of EUR totals',async()=>{
    const c=load('src/services/currencyService.ts',{}, {fetch:async()=>{throw Error('offline');}});
    const x=await c.buildEurSavePatch({costRaw:'100 AUD',depositRaw:'20 USD'});
    assert.equal(x.currencyUncertain,true);assert.equal(x.cost,'100 AUD');assert.equal(x.originalDepositCurrency,'USD');
    assert.equal(prices.resolvePaymentInfo(x).costNum,0);
  });
  await test('Stale cache, ambiguous currency and legacy uncertain EUR are never silently accepted',async()=>{
    const c=load('src/services/currencyService.ts',{}, {localStorage:{getItem:()=>JSON.stringify({date:'2020-01-01',fetchedAt:0,rates:{AUD:2}})},fetch:async()=>{throw Error('offline');}});
    assert.equal((await c.buildEurSavePatch({costRaw:'100 AUD'})).currencyUncertain,true);
    assert.equal((await c.buildEurSavePatch({costRaw:'$100'})).currencyUncertain,true);
    assert.equal((await c.buildEurSavePatch({costRaw:'84.51',existingItem:{cost:'84.51',currencyUncertain:true}})).currencyUncertain,true);
    assert.equal((await c.buildEurSavePatch({costRaw:'84.51 EUR',existingItem:{cost:'84.51',currencyUncertain:true}})).currencyUncertain,false);
  });
  await test('Cauzione is informational; an unrelated cost rate cannot be used for it',()=>{
    assert.equal(prices.resolveCauzioneInfo({originalCauzione:200,originalCauzioneCurrency:'NZD',originalCurrency:'AUD',exchangeRate:2}).eurEquivalentText,undefined);
    assert.ok(prices.resolveCauzioneInfo({originalCauzione:200,originalCauzioneCurrency:'AUD',originalCurrency:'AUD',exchangeRate:2}).eurEquivalentText);
    const x=prices.resolvePaymentInfo({cost:'100',depositPaid:'25',cauzione:'200 AUD'});
    assert.equal(x.costNum,100);assert.equal(x.paidNum,25);assert.equal(x.remainingNum,75);
  });
  await test('Nested maps/arrays and null-clears survive split/merge without public disclosure',()=>{
    const full={id:'a',cost:'50',depositPaid:null,originalDepositCurrency:'USD',details:{label:'ok',originalCost:100},stops:[{name:'one',exchangeRate:2},null,{name:'two'}]};
    const split=security.splitEntitySecurityData('alloggio','synthetic',full);
    assert.equal(split.publicDoc.cost,undefined);assert.equal(split.publicDoc.stops,undefined);
    assert.equal(split.publicDoc.publicSchemaVersion,2);
    const merged=security.mergeEntitySecurityData(split.publicDoc,split.privateCredentialsDoc);
    assert.equal(JSON.stringify(merged.details),JSON.stringify(full.details));assert.equal(merged.stops[0].exchangeRate,2);
    assert.equal(JSON.stringify(merged.stops),JSON.stringify(full.stops));
    assert.equal(merged.depositPaid,null);assert.equal(split.publicDoc.originalDepositCurrency,undefined);
  });
  await test('Production auth ignores injected mock; DEV retains explicit fixture support',async()=>{
    let realEmail=0,realGoogle=0;
    class GoogleAuthProvider {setCustomParameters(){} addScope(){} }
    const deps={'firebase/auth':{GoogleAuthProvider,signInWithEmailAndPassword:async()=>{realEmail++;throw {code:'auth/invalid-credential'};},signInWithPopup:async()=>{realGoogle++;throw {code:'auth/popup-closed-by-user'};}},'firebase/firestore':{},'../firebase':{auth:{}},'../utils/tripDiscovery':{},'./userAccessService':{}};
    const globals={window:{__HOUNIGO_MOCK_GOOGLE_USER__:{uid:'injected'}}};
    const prod=load('src/services/accountService.ts',deps,globals);
    assert.equal((await prod.loginWithEmailPassword('test@example.com','bad')).success,false);
    assert.equal((await prod.loginWithGoogle()).success,false);assert.equal(realEmail,1);assert.equal(realGoogle,1);
    const dev=load('src/services/accountService.ts',deps,globals,true);
    assert.equal((await dev.loginWithGoogle()).user.uid,'injected');assert.equal(realGoogle,1);
  });
  await test('LIVE deletion revokes Storage first and never hides a failed revocation',async()=>{
    let fail=true;const actions=[];let role='copilota';
    const api=load('src/services/liveService.ts',{
      'firebase/firestore':{
        doc:(_db,...parts)=>parts.join('/'),
        getDoc:async ref=>({exists:()=>true,data:()=>ref.includes('/updates/')?{photoUrl:'https://firebasestorage.googleapis.com/synthetic'}:ref.includes('/members/')?{role}:{ownerUid:'owner',members:['test']}}),
        updateDoc:async()=>actions.push('soft-delete'),deleteDoc:async()=>actions.push('delete-feed'),
      },
      '../firebase':{db:{},auth:{currentUser:{uid:'test'}}},'../config/featureFlags':{FEATURE_FLAGS:{}},
      './liveStorageService':{deleteLivePhoto:async()=>{actions.push('revoke-storage');if(fail)throw Error('offline');}},
    }).liveService;
    api.recordLocalUpdateTombstone=()=>actions.push('tombstone');
    await assert.rejects(api.deleteLiveUpdate('0000','post'),/offline/);
    assert.deepEqual(actions,['revoke-storage']);actions.length=0;fail=false;
    await api.deleteLiveUpdate('0000','post');assert.deepEqual(actions,['revoke-storage','soft-delete','tombstone']);
    actions.length=0;role='viewer';await assert.rejects(api.deleteLiveUpdate('0000','post'),/autorizzati/);assert.equal(actions.length,0);
  });
  await test('Sensitive field keys in Firestore rules exactly cover client keys',()=>{
    const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
    const guard=rules.slice(rules.indexOf('function hasNoSensitiveKeys'),rules.indexOf('// Fail closed'));
    for(const key of security.SENSITIVE_KEYS)assert.ok(guard.includes(`'${key}'`),key);
  });
  await test('Unshared local photos require the same trip, authenticated user and editor role',()=>{
    const privacy=load('src/utils/livePhotoPrivacy.ts');
    const photo={tripId:'a',userId:'owner'};
    assert.equal(privacy.canReadLocalLivePhoto(photo,'a','owner','owner',false),true);
    for(const [trip,user,role,external] of [['a','owner','viewer',false],['b','owner','owner',false],['a','different-user','copilota',false],['a','owner','owner',true]])
      assert.equal(privacy.canReadLocalLivePhoto(photo,trip,user,role,external),false);
    assert.equal(privacy.canReadLocalLivePhoto({},'a','owner','owner',false),false);
  });
  await test('Adjacent currency codes, unknown currencies and ambiguous yen cannot silently become EUR',()=>{
    assert.equal(currency.detectCurrencyFromValue('AUD100').currency,'AUD');
    assert.equal(currency.detectCurrencyFromValue('USD100').currency,'USD');
    assert.equal(currency.detectCurrencyFromValue('¥100 JPY').currency,'JPY');
    assert.equal(currency.detectCurrencyFromValue('¥100').isAmbiguous,true);
    assert.equal(currency.detectCurrencyFromValue('100 INR').isAmbiguous,true);
    assert.equal(prices.parseCostToNumber('100 INR'),0);
  });
  console.log(`All ${passed} release fix checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
