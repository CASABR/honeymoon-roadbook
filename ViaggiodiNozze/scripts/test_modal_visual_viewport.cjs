const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const fixtureDir = fs.mkdtempSync(path.join(root, 'safearea-fixture-'));
  const fixtureName = path.basename(fixtureDir);
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="root"></div><script type="module" src="./main.tsx"></script>');
  fs.writeFileSync(path.join(fixtureDir, 'main.tsx'), `import React from 'react'; import {createRoot} from 'react-dom/client'; import Modal from '../src/components/common/Modal'; import '../src/index.css'; createRoot(document.getElementById('root')!).render(<Modal isOpen onClose={()=>{}} title="Test" centered={new URLSearchParams(location.search).has('centered')} footer={<button>Salva</button>}>{Array.from({length:20},(_,i)=><div key={i}><input aria-label={'Campo '+i} /></div>)}</Modal>);`);
  let server,browser;
  try {
    const {createServer}=await import('vite');
    server=await createServer({root,server:{host:'127.0.0.1',port:5203,strictPort:true}});await server.listen();
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const ctx=await browser.newContext({viewport:{width:393,height:852},serviceWorkers:'block'});
    await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await ctx.addInitScript(()=>{
      const vv=new EventTarget();
      vv.height=innerHeight;vv.offsetTop=0;
      Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>vv});
      window.setTestViewport=(h,t)=>{vv.height=h;vv.offsetTop=t;vv.dispatchEvent(new Event('resize'));};
    });
    const page=await ctx.newPage();
    for(const [w,h,insets] of [[393,852,[59,0,34,0]],[852,393,[0,59,21,59]],[744,1133,[24,0,20,0]]]){
      await page.setViewportSize({width:w,height:h});
      for(const centered of [false,true]){
        await page.goto('http://127.0.0.1:5203/'+fixtureName+'/index.html'+(centered?'?centered=1':''));
        await page.getByRole('dialog').waitFor();
        await page.evaluate(v=>['top','right','bottom','left'].forEach((e,i)=>document.documentElement.style.setProperty('--app-safe-'+e,v[i]+'px')),insets);
        const geometry=()=>page.evaluate(()=>{const o=document.querySelector('.modal-backdrop-layer'),d=document.querySelector('.modal-sheet-container'),f=document.querySelector('.modal-sheet-footer');const a=o.getBoundingClientRect(),b=d.getBoundingClientRect(),c=f.getBoundingClientRect();return {top:a.top,bottom:a.bottom,dt:b.top,db:b.bottom,dl:b.left,dr:b.right,footer:c.bottom};});
        let g=await geometry();
        assert.ok(g.dt>=insets[0]-1 && g.dl>=insets[3]-1 && g.dr<=w-insets[1]+1 && g.db<=h+1,JSON.stringify(g));
        const vh=Math.round(h*0.55),top=12;
        await page.evaluate(([h,t])=>window.setTestViewport(h,t),[vh,top]);
        await page.locator('[data-visual-viewport="active"]').waitFor();
        g=await geometry();
        assert.ok(Math.abs(g.top-top)<=1 && Math.abs(g.bottom-(top+vh))<=1,JSON.stringify(g));
        assert.ok(g.dt>=top-1 && g.db<=top+vh+1 && g.footer<=top+vh+1,JSON.stringify(g));
        await page.evaluate(h=>window.setTestViewport(h,0),h);
        await page.waitForFunction(()=>!document.querySelector('[data-visual-viewport="active"]'));
        g=await geometry();assert.ok(Math.abs(g.bottom-h)<=1,JSON.stringify(g));
        console.log('PASS viewport '+w+'x'+h+' centered='+centered);
      }
    }
  } finally {await browser?.close();await server?.close();fs.rmSync(fixtureDir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
