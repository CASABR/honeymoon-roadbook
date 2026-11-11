// Offline, read-only compatibility check against an explicitly supplied local snapshot.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');const root=path.resolve(__dirname,'..');
const index=process.argv.indexOf('--snapshot');if(index<0)throw Error('Pass --snapshot <local-backup.json>; this test never connects to production.');
function load(relative,deps={}){
 const exports={};const js=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports,require:id=>{assert.ok(id in deps,id);return deps[id];},console,Date,AbortController,setTimeout,clearTimeout});return exports;
}
const security=load('src/utils/securityDataSplitter.ts');
const currency=load('src/services/currencyService.ts');
const prices=load('src/utils/priceHelper.ts',{'../services/currencyService':currency});
const snapshot=JSON.parse(fs.readFileSync(process.argv[index+1],'utf8'));
const vault=new Map((snapshot.private_credentials||[]).map(d=>[d.id,d]));
let records=0,secretValues=0,queryReady=0,needsSchemaReview=0;const unsupported=new Set();
for(const col of ['trasporti','alloggi','attivita','ristoranti','shopping'])for(const original of snapshot[col]||[]){
 const type=security.normalizeEntityType(col);
 const secret=vault.get(security.getVaultDocId(type,original.id))||vault.get(original.id);
 const full=security.mergeEntitySecurityData(original,secret);
 const split=security.splitEntitySecurityData(type,'0000',full);
 const restored=security.mergeEntitySecurityData(split.publicDoc,split.privateCredentialsDoc);
 for(const key of security.SENSITIVE_KEYS)if(full[key]!==undefined&&full[key]!==''&&key!=='privateNested'){
   assert.equal(JSON.stringify(restored[key]),JSON.stringify(full[key]),`Private value lost: ${col}.${key}`);secretValues++;
   assert.equal(split.publicDoc[key],undefined,`Public leak: ${col}.${key}`);
 }
 const info=prices.resolvePaymentInfo(full);
 if(info.costNum>0)assert.equal(currency.roundEur(info.paidNum+info.remainingNum),info.costNum);
 if(split.publicDoc.publicSchemaVersion===2)queryReady++;
 else {needsSchemaReview++;for(const key of Object.keys(split.publicDoc))if(!security.PUBLIC_DATA_SCHEMAS[col].includes(key))unsupported.add(`${col}.${key}`);}
 records++;
}
console.log(JSON.stringify({snapshot:path.basename(process.argv[index+1]),trip:'0000',recordsChecked:records,privateValuesPreserved:secretValues,queryReadyAfterSanitization:queryReady,needsSchemaReview,unsupportedFieldNames:[...unsupported].sort(),productionWrites:0}));
