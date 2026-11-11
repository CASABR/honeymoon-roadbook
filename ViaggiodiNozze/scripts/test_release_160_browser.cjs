const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ts=require('typescript');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const assets=fs.readdirSync(path.join(dist,'assets')).filter(n=>n.endsWith('.js'));
assert.ok(!assets.some(n=>fs.readFileSync(path.join(dist,'assets',n),'utf8').includes('__HOUNIGO_MOCK_GOOGLE_USER__')),'Production bundles must contain no login mock marker');
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(req.url.split('?')[0]).replace(/^\/honeymoon-roadbook\//,'');
 const file=path.resolve(dist,relative||'index.html');
 if(!file.startsWith(dist+path.sep)) {res.writeHead(404);res.end();return;}
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);res.end();return;}const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(body);});
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>sessionStorage.setItem('hounigo_motion_splash_seen_v1','1'));
  let online=true,requests=0;
  await context.route(/^https:\/\//,async route=>{
   if(route.request().url().startsWith('https://api.frankfurter.dev/')){
    requests++;if(!online)return route.abort();
    const code=new URL(route.request().url()).searchParams.get('to');
    return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({date:'2026-11-10',rates:{[code]:code==='AUD'?2:1.25}})});
   }
   return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('Browser runtime:',error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/honeymoon-roadbook/`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Crea il tuo viaggio/}).waitFor();
  const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/services/currencyService.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  await page.addScriptTag({content:`window.releaseCurrency={};(function(exports){${code}\n})(window.releaseCurrency);`});
  const converted=await page.evaluate(()=>window.releaseCurrency.buildEurSavePatch({costRaw:'100 AUD',depositRaw:'20 USD'}));
  assert.equal(converted.cost,'50.00');assert.equal(converted.depositPaid,'16.00');assert.equal(requests,2);
  online=false;await page.evaluate(()=>localStorage.removeItem('hounigo_ecb_rates_v1'));
  const offline=await page.evaluate(()=>window.releaseCurrency.buildEurSavePatch({costRaw:'100 AUD'}));
  assert.equal(offline.currencyUncertain,true);assert.equal(offline.cost,'100 AUD');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.evaluate(()=>{
    const photo={id:'private-photo',tripId:'synthetic',userId:'synthetic-owner',url:'data:image/png;base64,cHJpdmF0ZQ==',dataUrl:'data:image/png;base64,cHJpdmF0ZQ==',caption:'PRIVATE-PHOTO-DO-NOT-SHOW',timestamp:new Date().toISOString(),isCustom:true};
    localStorage.setItem('hounigo_live_gallery',JSON.stringify([photo]));
    localStorage.setItem('live_last_photo',JSON.stringify(photo));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/honeymoon-roadbook/?view=live&tripId=synthetic`,{waitUntil:'domcontentloaded'});
  await page.locator('.hounigo-live-entry').waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE-PHOTO-DO-NOT-SHOW'));
  assert.equal(await page.locator('img[src="data:image/png;base64,cHJpdmF0ZQ=="]').count(),0);
  console.log('PASS: production bundles omit login mocks; production CSP allows the existing rates endpoint; offline failure stays unresolved; mobile onboarding and public LIVE load without exposing cached private photos.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
