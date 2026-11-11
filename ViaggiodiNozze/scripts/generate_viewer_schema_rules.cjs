// Generates bounded, per-collection validation without reading production data.
const fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const ast=ts.createSourceFile('types.ts',fs.readFileSync(path.join(root,'src/types/index.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const names={giorni:'Giorno',tappe:'Tappa',attivita:'Attivita',alloggi:'Alloggio',trasporti:'Trasporto',ristoranti:'Ristorante',shopping:'ShoppingItem',bagagli:'Bagaglio'};
const shared=['id','createdAt','updatedAt','lastSanitizedAt','hasPrivateCredentials','deleted','deletedAt','deletedBy','_enriched','publicSchemaVersion'];
const schemas=Object.fromEntries(Object.entries(names).map(([col,name])=>{
 const fields=new Set(shared);
 for(const n of ast.statements)if(ts.isInterfaceDeclaration(n)&&n.name.text===name)for(const p of n.members)if(p.name&&ts.isIdentifier(p.name))fields.add(p.name.text);
 return[col,fields];
}));
// Explicit historical scalar aliases used by existing clients.
for(const fields of Object.values(schemas))for(const k of ['date','data','title','titolo','name','nome','notes','nota','status','time','orario','dayId','coordinate','location','address','indirizzo','sottocategoria','category','completed','timeStatus'])fields.add(k);
for(const key of ['mapsUrl','order'])schemas.attivita.add(key);
for(const key of ['link','scopo'])schemas.shopping.add(key);
const vm=require('node:vm'),exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/utils/securityDataSplitter.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const secrets=new Set(exportsObject.SENSITIVE_KEYS);
let functions=`    // BEGIN OPERATIONAL VIEWER VALIDATORS
    function publicReferenceSlot(value, index) {
      return value.size() <= index || (value[index] is string && value[index].matches('^[A-Za-z0-9_-]{1,128}$'));
    }
    function publicDocumentReferences(value) {
      return value == null || (value is list && value.size() <= 32
        ${Array.from({length:32},(_,i)=>`&& publicReferenceSlot(value, ${i})`).join('\n        ')});
    }
    function validDocumentPublication(data) {
      return (!('linkedDocumentId' in data) || data.linkedDocumentId == null
          || data.linkedDocumentId in data.get('publicDocumentIds', []))
        && (!('linkedDocumentIds' in data) || data.linkedDocumentIds == null
          || data.linkedDocumentIds.hasOnly(data.get('publicDocumentIds', [])));
    }
    function publicHoursSlot(value, key) {
      return !(key in value) || (value[key] is string && value[key].size() <= 200);
    }
    function publicExceptionSlot(value, index) {
      return value.keys().size() <= index || (value.keys()[index].matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && publicHoursSlot(value, value.keys()[index]));
    }
    function publicOpeningHours(value) {
      return value == null || (value is map
        && value.keys().hasOnly(['status','accessType','weekly','exceptions','source','verifiedAt','timeZone','notes'])
        && value.status in ['unverified','manual','verified'] && value.accessType in ['unknown','attraction','outdoor']
        && (!('weekly' in value) || (value.weekly is map && value.weekly.keys().hasOnly(['sun','mon','tue','wed','thu','fri','sat'])
          ${['sun','mon','tue','wed','thu','fri','sat'].map(k=>`&& publicHoursSlot(value.weekly, '${k}')`).join('\n          ')}))
        && (!('exceptions' in value) || (value.exceptions is map && value.exceptions.size() <= 32
          ${Array.from({length:32},(_,i)=>`&& publicExceptionSlot(value.exceptions, ${i})`).join('\n          ')}))
        ${['source','verifiedAt','timeZone','notes'].map(k=>`&& (!('${k}' in value) || (value.${k} is string && value.${k}.size() <= 2048))`).join('\n        ')});
    }
    function publicLayover(value) {
      return value == null || (value is map
        && value.keys().hasOnly(['airport','duration','arrivalTime','departureTime','departureDate','arrivalDate','carrier','notes'])
        ${['airport','duration','arrivalTime','departureTime','departureDate','arrivalDate','carrier','notes'].map(k=>`&& (!('${k}' in value) || value.${k} is string)`).join('\n        ')});
    }
`;
const validator=k=>k==='openingHours'?'OpeningHours':k==='layover'?'Layover':/^(linkedDocumentIds|publicDocumentIds)$/.test(k)?'DocumentReferences':k==='linkedDocumentId'?'DocumentReference':/coordinate|coords/i.test(k)?'Coordinates':'Scalar';
functions+=`    function publicDocumentReference(value) { return value == null || (value is string && value.matches('^[A-Za-z0-9_-]{1,128}$')); }\n`;
const clientSchemas={};
for(const[col,fields]of Object.entries(schemas)){
 const keys=[...fields].filter(k=>!secrets.has(k)).sort();
 clientSchemas[col]=keys;
 const groups=[];
 for(let i=0;i<keys.length;i+=10){
   const g=keys.slice(i,i+10);const name=`viewer_${col}_${i/10}`;groups.push(name);
   functions+=`    function ${name}(data) {\n      return `+g.map(k=>`(!('${k}' in data) || public${validator(k)}(data.${k}))`).join('\n        && ')+';\n    }\n\n';
 }
 functions+=`    function viewer_${col}(data) {\n      return data.keys().hasOnly(${JSON.stringify(keys)})\n`+groups.map(n=>`        && ${n}(data)`).join('\n')+';\n    }\n\n';
}
functions+=`    function safeSharedViewerDocument(data, subcol) {\n      return hasNoSensitiveKeys(data) && validDocumentPublication(data) && (\n`+Object.keys(schemas).map(col=>`        (subcol == '${col}' && viewer_${col}(data))`).join(' ||\n')+'\n      );\n    }\n';
const file=path.join(root,'firestore.rules');let s=fs.readFileSync(file,'utf8');
const oldStart=s.indexOf('    function safeSharedValues0');
const operationalStart=s.indexOf('    // BEGIN OPERATIONAL VIEWER VALIDATORS');
const start=operationalStart >= 0 ? operationalStart : oldStart >= 0 ? oldStart : s.indexOf('    function viewer_giorni_0');
const end=s.indexOf('    // =========================================================================',start);
if(start<0||end<0)throw Error('Viewer schema markers missing');
s=s.slice(0,start)+functions+'\n'+s.slice(end);
s=s.replace('safeSharedViewerDocument(resource.data)','safeSharedViewerDocument(resource.data, subcol)');
fs.writeFileSync(file,s);fs.copyFileSync(file,path.join(root,'..','firestore.rules'));
const splitter=path.join(root,'src/utils/securityDataSplitter.ts');
let splitterSource=fs.readFileSync(splitter,'utf8');
const generated=`// BEGIN GENERATED PUBLIC SCHEMAS\nexport const PUBLIC_DATA_SCHEMAS: Record<string, string[]> = ${JSON.stringify(clientSchemas,null,2)};\n// END GENERATED PUBLIC SCHEMAS`;
if(splitterSource.includes('// BEGIN GENERATED PUBLIC SCHEMAS'))splitterSource=splitterSource.replace(/\/\/ BEGIN GENERATED PUBLIC SCHEMAS[\s\S]*?\/\/ END GENERATED PUBLIC SCHEMAS/,generated);
else splitterSource=splitterSource.replace('function privateTree(value: any): any {',generated+'\n\nfunction privateTree(value: any): any {');
fs.writeFileSync(splitter,splitterSource);
console.log('Generated per-collection Viewer schema rules.');
