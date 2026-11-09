const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,deps={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>deps[id],URL});
  return exports;
}
const tasks=load('taskTappa.ts');
let lookups=0;
const live=load('liveIntelligenceHelper.ts',{'./taskTappa':tasks,'./geoCoordinatesHelper.ts':{lookupKnownCoordinate:()=>{lookups++;return{lat:41.9,lng:12.5}}}});
const params={giorni:[],attivita:[],trasporti:[],currentDateTime:new Date('2026-11-09T09:00:00Z'),tripStartDate:'2026-11-09',tripEndDate:'2026-11-12',timeZone:'UTC'};
for(const date of ['2026-11-09','2026-11-10']) {
  const result=live.deriveLiveIntelligence({...params,tappe:[{id:'synthetic',titolo:'Task Roma',sottocategoria:'Task',data:date,orario:'12:00',coordinate:{lat:41.9,lng:12.5}}]});
  assert.ok(!JSON.stringify(result).includes('Task Roma'),'Task must never supply planned geographic context');
}
assert.equal(lookups,0,'No coordinate lookup for Task');
live.deriveLiveIntelligence({...params,tappe:[{id:'ordinary',titolo:'Roma',sottocategoria:'Tappa',data:'2026-11-09'}]});
assert.ok(lookups>0,'Ordinary geographic Tappe retain coordinate lookup');
assert.equal(tasks.getTaskLink('javascript:alert(1)'),undefined);
assert.equal(tasks.getTaskLink('https://example.com/task'),'https://example.com/task');
console.log('PASS Task geography: current/future Tasks excluded from LIVE location; ordinary Tappe unchanged; web-link schemes validated');
