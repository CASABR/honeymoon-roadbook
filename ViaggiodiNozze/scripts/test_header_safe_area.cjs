const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'.p0-queue-test-header-preview');
const deadline=setTimeout(()=>{console.error('FAIL: header smoke exceeded 90 seconds');process.exit(1);},90000);
(async()=>{
  const {preview}=await import('vite');
  const server=await preview({root,configFile:false,base:'/honeymoon-roadbook/',preview:{host:'127.0.0.1',port:5193,strictPort:true}});
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:10000,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await context.addInitScript(()=>{
      sessionStorage.setItem('hounigo_motion_splash_seen_v1','1');
      localStorage.setItem('houni_authenticated','true');
      localStorage.setItem('houni_trip_id','synthetic-header-preview');
      localStorage.setItem('houni_device_role','viewer');
      localStorage.setItem('houni_onboarding_completed_v1','true');
      localStorage.setItem('walkthrough_seen','true');
      localStorage.setItem('ios_install_prompt_dismissed','true');
      localStorage.setItem('roadbook_trip_config',JSON.stringify({id:'synthetic-header-preview',title:'Header preview',startDate:'2026-11-09',endDate:'2026-11-10'}));
    });
    const page=await context.newPage();page.setDefaultTimeout(5000);
    await page.goto('http://127.0.0.1:5193/honeymoon-roadbook/',{waitUntil:'domcontentloaded',timeout:10000});
    await page.locator('header.app-mobile-header').waitFor({state:'visible',timeout:10000});
    fs.mkdirSync(output,{recursive:true});
    for (const [width,height,insets] of [[390,844,[0,0,0,0]],[430,932,[59,0,34,0]],[1440,900,[0,0,0,0]],[932,430,[0,59,21,59]]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(values=>['top','right','bottom','left'].forEach((edge,i)=>document.documentElement.style.setProperty('--app-safe-'+edge,values[i]+'px')),insets);
      const dimensions=[];
      for (const dark of [false,true]) {
        await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
        await page.evaluate(()=>Promise.all(Array.from(document.images).map(img=>img.decode().catch(()=>{}))));
        const geometry=await page.evaluate(()=>{
          const image=Array.from(document.querySelectorAll('header img[alt="Hounigo"],aside img[alt="Hounigo"]')).find(img=>img.getBoundingClientRect().width>0);
          if (!image) throw Error('No visible header logo');
          const r=image.getBoundingClientRect(),frame=image.parentElement.getBoundingClientRect(),dark=image.src.includes('on-dark'),scale=r.width/1024;
          const search=document.querySelector('header [aria-label="Ricerca globale nel viaggio"]');
          const sr=search.getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth>innerWidth,frame:{x:frame.x,y:frame.y,w:frame.width,h:frame.height},art:{x:r.x+79*scale,y:r.y+(dark?60:95)*scale,w:874*scale,h:(dark?232:231)*scale},search:{x:sr.x,y:sr.y,w:sr.width,h:sr.height},headerVisible:sr.width>0};
        });
        assert.equal(geometry.overflow,false,'Horizontal overflow at '+width);
        if (width<768) {assert.equal(geometry.search.w,44);assert.equal(geometry.search.h,44);assert.ok(geometry.search.y>=insets[0]);}
        assert.ok(geometry.frame.x>=insets[3]);
        dimensions.push(geometry);
        await page.screenshot({path:path.join(output,width+'-'+(dark?'dark':'light')+'.png'),timeout:5000});
        // Use the unchanged global-search event on desktop, where the mobile header is hidden.
        if (width<768) await page.locator('header [aria-label="Ricerca globale nel viaggio"]').click();
        else await page.keyboard.press('Control+k');
        const modal=page.getByRole('dialog',{name:'Ricerca globale nel viaggio'});
        await modal.waitFor({state:'visible'});
        const panel=await page.locator('.app-search-panel').boundingBox();
        assert.ok(panel.y>=insets[0] && panel.x>=insets[3] && panel.x+panel.width<=width-insets[1]+1 && panel.y+panel.height<=height-insets[2]+1,'Search safe-area bounds '+width);
        await modal.locator('input[type=search]').fill('no-synthetic-result');
        await page.keyboard.press('Escape');
        await modal.waitFor({state:'hidden'});
      }
      assert.deepEqual(dimensions[0].frame,dimensions[1].frame,'Theme changed logo layout');
      for(const edge of ['x','y','w','h']) assert.ok(Math.abs(dimensions[0].art[edge]-dimensions[1].art[edge])<0.15,'Theme changed perceived logo '+edge);
      console.log('PASS '+width+'px: light/dark logo parity, layout, search and simulated safe areas');
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>['top','right','bottom','left'].forEach(edge=>document.documentElement.style.setProperty('--app-safe-'+edge,'0px')));
    await page.locator('nav.app-bottom-nav button').filter({hasText:'Altro'}).click();
    await page.getByText('Live & Posizione',{exact:true}).waitFor({state:'visible'});
    await page.locator('nav.app-bottom-nav button').filter({hasText:'Viaggio'}).click();
    console.log('PASS navigation: Altro and Viaggio; no external requests allowed; isolated synthetic browser profile');
    console.log('Screenshots: '+output);
  } finally {await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));clearTimeout(deadline);}
})().catch(error=>{console.error(error);process.exitCode=1;clearTimeout(deadline);});
