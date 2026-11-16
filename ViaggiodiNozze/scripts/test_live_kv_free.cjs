// Isolated only: real SQLite in memory, KV double, mocked Firebase HTTP, real Chromium canvas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite'),{pathToFileURL}=require('node:url'),ts=require('typescript'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),worker=path.join(root,'cloudflare/houniai-worker');
const origin='https://casabr.github.io',base='https://photos.test',project='demo-live-photos';
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=(uid,provider='google.com')=>`${b64({alg:'RS256'})}.${b64({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,firebase:{sign_in_provider:provider}})}.fixture`;
const tokens=new Map(['owner','copilot','viewer','array-only','stranger'].map(uid=>[token(uid),uid]));
tokens.set(token('owner','anonymous'),'owner');
const posts=new Map();let firebaseCalls=0,ip=0,passed=0,revokedCopilot=false;
const fields=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]));
const realFetch=global.fetch;
global.fetch=async(url,options={})=>{
  firebaseCalls++;url=String(url);
  if(url.startsWith('https://identitytoolkit.googleapis.com/')){const uid=tokens.get(JSON.parse(options.body).idToken);return Response.json(uid?{users:[{localId:uid,disabled:false}]}:{error:'invalid'}, {status:uid?200:401});}
  if(url.startsWith('https://firestore.googleapis.com/')){
    const p=decodeURIComponent(url.split('/documents/')[1]||'');
    if(p==='trips/demo')return Response.json({fields:{...fields({ownerUid:'owner'}),members:{arrayValue:{values:[{stringValue:'array-only'}]}}}});
    const member=p.match(/^trips\/demo\/members\/(.+)$/)?.[1];
    if(member&&['copilot','viewer'].includes(member))return Response.json({fields:fields({role:member==='copilot'&&!revokedCopilot?'copilota':'viewer'})});
    if(posts.has(p))return Response.json({fields:fields(posts.get(p))});
    return Response.json({}, {status:404});
  }
  throw Error('Unexpected network forbidden: '+url);
};
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(worker,'migrations/0003_live_photos.sql'),'utf8'));
  const database={withSession(mode){assert.equal(mode,'first-primary');return this;},prepare(query){let values=[];return {bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)||null;},async run(){const result=sql.prepare(query).run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};}};
  const values=new Map();const kv={puts:0,gets:0,staleDelete:false,onGet:null,async put(k,v){this.puts++;if(this.fail)throw Error('KV quota');values.set(k,Uint8Array.from(v));},async get(k){this.gets++;if(this.onGet)await this.onGet();const v=values.get(k);return v?Uint8Array.from(v).buffer:null;},async delete(k){if(!this.staleDelete)values.delete(k);}};
  return {sql,kv,env:{LIVE_PHOTOS_ENABLED:'true',LIVE_PHOTOS_FREE_PLAN_CONFIRMED:'true',LIVE_PHOTOS:kv,RATE_LIMITS:database,ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:project,FIREBASE_WEB_API_KEY:'fixture-only'}};
}
const call=(handler,f,p,method='GET',uid=null,body,extra={})=>handler(new Request(base+p,{method,body,headers:{...(method==='GET'?{}:{Origin:origin}),...(uid?{Authorization:'Bearer '+(tokens.has(uid)?uid:token(uid))}:{}),...(body?{'Content-Type':'image/jpeg'}:{}),'CF-Connecting-IP':`192.0.2.${++ip}`,...extra}}),f.env);
const check=async(name,fn)=>{await fn();console.log(`PASS ${++passed}: ${name}`);};
function load(source,deps={},globals={}){const exports={};const js=ts.transpileModule(source.replaceAll('import.meta.env','({DEV:false,VITE_LIVE_PHOTOS_WORKER_URL:"https://photos.test"})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports,require:id=>{assert.ok(id in deps,'Unexpected import '+id);return deps[id];},console,URL,Blob,AbortSignal,Date,setTimeout,clearTimeout,...globals});return exports;}
(async()=>{
  const {handleRequest}=await import(pathToFileURL(path.join(worker,'src/index.js')).href);
  const {sanitizeJpeg}=await import(pathToFileURL(path.join(worker,'src/livePhotos.js')).href);
  let jpeg;const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<body></body>'}));await page.goto(origin);
    const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/utils/livePhotoImage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const result=await page.evaluate(async code=>{
      const exports={};new Function('exports','require',code)(exports,()=>({dataUrlToBlob:s=>{const [h,b]=s.split(',');return new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:h.match(/:(.*?);/)[1]});}}));
      const canvas=document.createElement('canvas');canvas.width=2200;canvas.height=1600;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(2200,1600);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=Math.random()*255;pixels.data[i+1]=Math.random()*255;pixels.data[i+2]=Math.random()*255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
      const raw=await new Promise(r=>canvas.toBlob(r,'image/png'));const compressed=await exports.compressLivePhoto(raw);const image=new Image();image.src=URL.createObjectURL(compressed);await image.decode();return {bytes:Array.from(new Uint8Array(await compressed.arrayBuffer())),width:image.naturalWidth,height:image.naturalHeight,type:compressed.type};
    },code);
    jpeg=Uint8Array.from(result.bytes);assert.equal(result.type,'image/jpeg');assert.ok(jpeg.length<=512000);assert.ok(Math.max(result.width,result.height)<=1600);
    console.log(`PASS ${++passed}: real Chromium compression ${jpeg.length} bytes, ${result.width}x${result.height}, JPEG`);
  }finally{await browser.close();}
  await check('server removes EXIF/GPS, rejects SVG, malformed and oversized images',()=>{
    const exif=Buffer.from('Exif\0\0GPSLatitude=secret');const length=exif.length+2;const tagged=Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225,length>>8,length&255]),exif,jpeg.subarray(2)]);
    assert.equal(Buffer.from(sanitizeJpeg(tagged)).includes(Buffer.from('GPSLatitude')),false);
    assert.throws(()=>sanitizeJpeg(Buffer.from('<svg onload=alert(1)>')));assert.throws(()=>sanitizeJpeg(new Uint8Array(512001)));assert.throws(()=>sanitizeJpeg(Buffer.concat([jpeg,Buffer.from('trailing')])));
  });
  await check('feature disabled/missing binding fails closed without Firebase calls',async()=>{const f=fixture();f.env.LIVE_PHOTOS_ENABLED='false';const before=firebaseCalls;assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg)).status,503);assert.equal(firebaseCalls,before);f.sql.close();});
  await check('real Worker Firebase HTTP path denies invalid, anonymous, Viewer, array-only, stranger and wrong Origin',async()=>{
    const f=fixture();for(const uid of [null,'invalid','viewer','array-only','stranger',token('owner','anonymous')]){f.sql.exec('DELETE FROM live_photo_requests');const r=await call(handleRequest,f,'/v1/live-photos/demo','POST',uid,jpeg);assert.ok([401,403].includes(r.status),uid+':'+r.status);}
    assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg,{Origin:'https://evil.test'})).status,403);assert.equal(f.kv.puts,0);f.sql.close();
  });
  const stage=async(f,uid='owner')=>{const r=await call(handleRequest,f,'/v1/live-photos/demo','POST',uid,jpeg);assert.equal(r.status,201,await r.clone().text());return r.json();};
  const publish=async(f,photo,uid='owner')=>{const id='post-'+photo.photoId;posts.set('live_feeds/demo/updates/'+id,{photoUrl:photo.downloadUrl,publicSchemaVersion:2,title:'Synthetic'});return call(handleRequest,f,`/v1/live-photos/demo/${photo.photoId}/publish?postId=${id}`,'POST',uid);};
  await check('Owner/Copilota upload and publish; pending bytes private even from another editor',async()=>{const f=fixture();for(const uid of ['owner','copilot']){const photo=await stage(f,uid);assert.match(photo.photoId,/^[a-f0-9]{48}$/);const gets=f.kv.gets;assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname)).status,404);assert.equal(f.kv.gets,gets);if(uid==='copilot')assert.equal((await publish(f,photo,'owner')).status,403);assert.equal((await publish(f,photo,uid)).status,200);}f.sql.close();});
  await check('publish requires actual matching v2 LIVE post; guest reads without Auth after publication',async()=>{const f=fixture(),photo=await stage(f);assert.equal((await call(handleRequest,f,`/v1/live-photos/demo/${photo.photoId}/publish?postId=missing`,'POST','owner')).status,409);assert.equal((await publish(f,photo)).status,200);const r=await call(handleRequest,f,new URL(photo.downloadUrl).pathname);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store, max-age=0');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),sanitizeJpeg(jpeg));f.sql.close();});
  await check('Viewer/cross-trip deletion denied; tombstone defeats stale KV and blocks republication',async()=>{const f=fixture(),photo=await stage(f);await publish(f,photo);const p=new URL(photo.downloadUrl).pathname;assert.equal((await call(handleRequest,f,p,'DELETE','viewer')).status,403);assert.equal((await call(handleRequest,f,p.replace('/demo/','/other/'),'DELETE','owner')).status,403);f.kv.staleDelete=true;assert.equal((await call(handleRequest,f,p,'DELETE','copilot')).status,200);assert.equal((await call(handleRequest,f,p)).status,404);assert.equal((await publish(f,photo)).status,409);f.sql.close();});
  await check('revocation racing an in-flight KV read is checked again before response',async()=>{const f=fixture(),photo=await stage(f);await publish(f,photo);f.kv.onGet=async()=>f.sql.prepare("UPDATE live_photo_objects SET status='deleted' WHERE id=?").run(photo.photoId);assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname)).status,404);f.sql.close();});
  await check('concurrent uploads cannot race SQLite minute limits',async()=>{const f=fixture();const result=await Promise.all(Array.from({length:8},()=>call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg)));assert.equal(result.filter(r=>r.status===201).length,3);assert.equal(f.kv.puts,3);f.sql.close();});
  await check('400 lifetime reservations hard-stop capacity, including deleted/failed objects',async()=>{const f=fixture();for(let i=0;i<400;i++)f.sql.prepare("INSERT INTO live_photo_objects VALUES (?,?,?,?,'deleted',0,NULL)").run('filler'+i,'demo','hash',512000);assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg)).status,429);assert.equal(f.kv.puts,0);f.sql.close();});
  await check('80/day global and 20/day UID limits are independent of the minute/capacity limits',async()=>{
    const {hashIdentity}=await import(pathToFileURL(path.join(worker,'src/core.js')).href);
    for(const [count,owner]of [[80,'other'],[20,await hashIdentity('owner')]]){const f=fixture();for(let i=0;i<count;i++)f.sql.prepare("INSERT INTO live_photo_objects VALUES (?,?,?,?,'failed',?,NULL)").run('day'+i,'demo',owner,100,Date.now()-120000);assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg)).status,429);assert.equal(f.kv.puts,0);f.sql.close();}
  });
  await check('upload size is bounded even without Content-Length and MIME is enforced',async()=>{const f=fixture();assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',new Uint8Array(512001))).status,413);assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg,{'Content-Type':'image/svg+xml'})).status,415);assert.equal(f.kv.puts,0);f.sql.close();});
  await check('server rechecks Copilota revocation before publication; Owner can still revoke the pending asset',async()=>{const f=fixture(),photo=await stage(f,'copilot');try{revokedCopilot=true;assert.equal((await publish(f,photo,'copilot')).status,403);assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname)).status,404);assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname,'DELETE','owner')).status,200);}finally{revokedCopilot=false;f.sql.close();}});
  await check('read quota exhaustion leaves authenticated deletion available',async()=>{const f=fixture(),photo=await stage(f);await publish(f,photo);f.sql.prepare('INSERT INTO live_photo_requests VALUES(?,20000,?)').run('read:'+new Date().toISOString().slice(0,10),Date.now()+10000);assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname)).status,429);assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname,'DELETE','owner')).status,200);f.sql.close();});
  await check('KV errors never yield successful uploads and do not refund unsafe reservations',async()=>{const f=fixture();f.kv.fail=true;assert.equal((await call(handleRequest,f,'/v1/live-photos/demo','POST','owner',jpeg)).status,503);assert.equal(f.sql.prepare("SELECT status FROM live_photo_objects").get().status,'failed');f.sql.close();});
  await check('real frontend adapter stages, confirms, deletes and rejects cross-trip/external URLs',async()=>{
    const f=fixture(),auth={currentUser:{uid:'owner',isAnonymous:false,getIdToken:async()=>token('owner')}};
    const service=load(fs.readFileSync(path.join(root,'src/services/liveStorageService.ts'),'utf8'),{'../firebase':{auth},'../config/freeArchitecture':{HOUNIAI_WORKER_URL:base},'../utils/livePhotoImage':{MAX_COMPRESSED_LIVE_BYTES:512000,compressLivePhoto:async()=>new Blob([jpeg],{type:'image/jpeg'})},'../utils/fileAttachment':{}},{fetch:async(url,options)=>handleRequest(new Request(url,{...options,headers:{...options.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.200'}}),f.env)});
    const photo=await service.uploadLivePhoto('demo',new Blob([jpeg]));assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname)).status,404);
    posts.set('live_feeds/demo/updates/frontend',{photoUrl:photo.downloadUrl,publicSchemaVersion:2});await service.confirmLivePhotoPublication('demo',photo.downloadUrl,'frontend');assert.equal((await call(handleRequest,f,new URL(photo.downloadUrl).pathname)).status,200);await assert.rejects(service.deleteLivePhoto('other',photo.downloadUrl));await assert.rejects(service.deleteLivePhoto('demo','https://evil.test/x'));assert.equal(await service.deleteLivePhoto('demo',photo.downloadUrl),true);f.sql.close();
  });
  await check('actual gallery upload function persists locally before quota/network/publication failure',async()=>{
    const file=path.join(root,'src/views/altro/LiveView.tsx'),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
    function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='handleUploadPhoto')fn=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);
    const stored=new Map(),storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};let gallery=[],publishes=0;
    const handler=load('exports.upload = '+fn,{'../../services/liveStorageService':{uploadLivePhoto:async()=>{throw Error('Quota foto gratuita esaurita');}}},{crypto,hasPrivateGalleryAccess:true,activeTripId:'demo',currentUid:'owner',compressImage:async()=> 'data:image/jpeg;base64,PRIVATE_LOCAL',syncingOfflinePhotoIdsRef:{current:new Set()},localStorage:storage,LAST_PHOTO_KEY:'live_last_photo',setGalleryCustomPhotos:f=>{gallery=typeof f==='function'?f(gallery):f;},currentLocation:null,isOnline:true,cloudRole:'owner',liveService:{publishToLive:async()=>publishes++}});
    await assert.rejects(handler.upload(new Blob([jpeg])));assert.ok(stored.get('hounigo_live_gallery').includes('PRIVATE_LOCAL'));assert.equal(gallery[0].pendingSync,true);assert.equal(publishes,0);
  });
  await check('actual predeparture -> LIVE post -> confirmation -> guest image, no base64 in Firestore',async()=>{
    const f=fixture(),auth={currentUser:{uid:'owner',isAnonymous:false,getIdToken:async()=>token('owner')}};
    const storage=load(fs.readFileSync(path.join(root,'src/services/liveStorageService.ts'),'utf8'),{'../firebase':{auth},'../config/freeArchitecture':{HOUNIAI_WORKER_URL:base},'../utils/livePhotoImage':{MAX_COMPRESSED_LIVE_BYTES:512000,compressLivePhoto:async()=>new Blob([jpeg],{type:'image/jpeg'})},'../utils/fileAttachment':{}},{fetch:async(url,options)=>handleRequest(new Request(url,{...options,headers:{...options.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.201'}}),f.env)});
    const db={},ref=(...parts)=>({path:parts.join('/'),id:parts.at(-1)});
    const firestore={collection:(_db,...parts)=>ref(...parts),doc:(parent,...parts)=>parts.length?ref(...parts):ref(parent.path,'predeparture-post'),
      getDoc:async r=>({exists:()=>true,data:()=>r.path==='trips/demo'?{ownerUid:'owner'}:posts.get(r.path)||{}}),
      writeBatch:()=>{const pending=[];return {set:(r,data)=>pending.push([r,data]),commit:async()=>{for(const[r,data]of pending)posts.set(r.path,data);}};},
      updateDoc:async(r,data)=>posts.set(r.path,{...posts.get(r.path),...data})};
    const live=load(fs.readFileSync(path.join(root,'src/services/liveService.ts'),'utf8'),{'firebase/firestore':firestore,'../firebase':{auth,db},'../config/featureFlags':{FEATURE_FLAGS:{}},'./liveStorageService':storage}).liveService;
    const filename=path.join(root,'src/components/cards/PreDeparturePhotoCard.tsx'),source=fs.readFileSync(filename,'utf8'),ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
    function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='publishPhotoToLive')fn=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);
    let saved=null,message='',toggle=true;const photo={id:'local',userId:'owner',url:'data:image/jpeg;base64,LOCAL_ONLY'};
    const card=load('exports.publish = '+fn,{'../../services/liveService':{liveService:live},'../../services/liveStorageService':storage},{tripId:'demo',getJournalUserId:()=>auth.currentUser.uid,setIsSharing(){},setMessage:v=>message=v,setPhoto:v=>saved=v,setShareOnLiveToggle:v=>toggle=v,setPredepartureLiveUpdate:(_trip,id)=>({...photo,liveUpdateId:id})});
    assert.equal(f.kv.puts,0);await card.publish(photo);assert.equal(saved.liveUpdateId,'predeparture-post');assert.ok(message.includes('condivisa'));
    const publicPost=posts.get('live_feeds/demo/updates/predeparture-post');assert.ok(!JSON.stringify(publicPost).includes('base64'));assert.equal((await call(handleRequest,f,new URL(publicPost.photoUrl).pathname)).status,200);
    const previous=saved;f.env.LIVE_PHOTOS_ENABLED='false';await card.publish(photo);assert.equal(saved,previous);assert.equal(toggle,false);assert.ok(message.includes('dispositivo'));assert.ok(!message.includes('condivisa in LIVE'));f.sql.close();
  });
  console.log(`All ${passed} isolated photo checks passed. Firebase HTTP/KV are doubles; not a cloud activation or real-phone certification.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=realFetch;});
