const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const remaining = process.argv.includes('--remaining');
const fixture = fs.mkdtempSync(path.join(root, '.p0-queue-test-task-'));
const deadline = setTimeout(() => { console.error('FAIL: Task component checks exceeded 90s'); process.exit(1); }, 90000);

// Focused component fixture: real form/card/storage/queue, synthetic trip and blocked external network.
fs.writeFileSync(path.join(fixture, 'index.html'), `<div id="root"></div><script>
localStorage.setItem('roadbook_trip_config',JSON.stringify({id:'synthetic-task',title:'Task test',startDate:'2026-11-09',endDate:'2026-11-10'}));
localStorage.setItem('houni_device_role','guida');localStorage.setItem('app_device_role','guida');
</script><script type="module" src="./fixture.tsx"></script>`);
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';import'/src/index.css';
import TappaForm from '/src/components/forms/TappaForm';import TappaCard from '/src/components/cards/TappaCard';
import{storageService}from'/src/storage/storageService';import{SyncService}from'/src/storage/syncService';
import{getPendingMutations}from'/src/storage/localMutationQueue';import{setAuthoritativeCloudRole}from'/src/utils/useAuthIdentity';
import{splitEntitySecurityData,mergeEntitySecurityData}from'/src/utils/securityDataSplitter';
import{deriveLiveIntelligence}from'/src/utils/liveIntelligenceHelper';import{getTaskLink}from'/src/utils/taskTappa';
setAuthoritativeCloudRole('unverified');const sync=new SyncService('synthetic-task');
window.taskApi={all:()=>storageService.getTappe(),timeline:()=>storageService.getTimelineForDate('2026-11-09'),queue:()=>getPendingMutations('synthetic-task'),add:d=>storageService.addTappa(d),splitEntitySecurityData,mergeEntitySecurityData,deriveLiveIntelligence,getTaskLink};
function Demo(){const[items,setItems]=useState([]),[editing,setEditing]=useState(null),[form,setForm]=useState(true);
const refresh=()=>storageService.getTappe().then(setItems);
useEffect(()=>{storageService.getTappe().then(rows=>{setItems(rows);setForm(!rows.length)});window.addEventListener('roadbook_data_mutated',refresh);return()=>window.removeEventListener('roadbook_data_mutated',refresh)},[]);
return <div className="max-w-md p-4"><button onClick={()=>{setEditing(null);setForm(true)}}>Nuovo</button>{form?<TappaForm initialData={editing} defaultDate="2026-11-09" onCancel={()=>setForm(false)} onSave={async d=>{if(d.id)await storageService.saveTappa({...editing,...d});else await storageService.addTappa(d);setForm(false);refresh()}}/>:items.map(t=><TappaCard key={t.id} tappa={t} onEdit={()=>{setEditing(t);setForm(true)}} onUpdate={refresh}/>)}</div>}
createRoot(document.getElementById('root')).render(<Demo/>);`);

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ root, server: { host:'127.0.0.1', port:5194, strictPort:true }, logLevel:'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, timeout:10000, args:['--no-sandbox'] });
    const context = await browser.newContext({ viewport:{width:430,height:932}, serviceWorkers:'block' });
    let geocodingRequests = 0;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/photon|nominatim|geocod/i.test(url.hostname)) geocodingRequests++;
      if (url.hostname === 'example.com') return route.fulfill({ status:200, contentType:'text/html', body:'Synthetic Task link' });
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    const url=`http://127.0.0.1:5194/${path.basename(fixture)}/index.html`;
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
    await page.locator('form').waitFor({timeout:15000});

    const card=page.locator('[data-task-card]');
    if (remaining) {
      await page.evaluate(()=>window.taskApi.add({titolo:'Check-in online',sottocategoria:'Task',data:'2026-11-09',orario:'09:30',link:'https://example.com/check-in',nota:'Preparare passaporto e codice prenotazione.'}));
      await page.reload({waitUntil:'domcontentloaded',timeout:15000});await card.waitFor();
    } else {
    // 1. Form: required name/time, optional geography, real save and link validation.
    await page.locator('select').first().selectOption('Task');
    assert.equal(await page.locator('form').evaluate(form=>form.checkValidity()),false);
    await page.getByLabel('Nome Task *').fill('Check-in online');
    assert.equal(await page.locator('form').evaluate(form=>form.checkValidity()),false);
    await page.getByLabel('Orario Task').fill('09:30');
    await page.getByLabel('Link URL (facoltativo)').fill('https://example.com/check-in');
    await page.locator('textarea').fill('Preparare passaporto e codice prenotazione.');
    assert.equal(await page.getByText('Cerca o digita luogo',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Crea Task',exact:true}).click();
    await card.waitFor();
    assert.match(await card.innerText(),/Check-in online/);assert.match(await card.innerText(),/09:30/);assert.match(await card.innerText(),/Da fare/);
    assert.equal(await card.getByRole('link',{name:/Maps/}).count(),0);
    const saved=await page.evaluate(()=>window.taskApi.all());
    assert.equal(saved.length,1);assert.equal(saved[0].sottocategoria,'Task');assert.ok(!saved[0].coordinate&&!saved[0].indirizzo&&!saved[0].mapsUrl);
    await page.waitForFunction(async()=> (await window.taskApi.queue()).some(q=>q.data.sottocategoria==='Task'));
    assert.equal(geocodingRequests,0);
    console.log('PASS form/front: required name/time, optional link/notes, no geography, offline queue');
    }

    // 2. Existing detail modal acts as the back, including link opening and completion/edit.
    await card.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.match(await dialog.innerText(),/Preparare passaporto/);
    assert.equal(await dialog.getByText('Luogo non specificato',{exact:true}).count(),0);
    assert.equal(await dialog.getByRole('link',{name:'Apri link'}).getAttribute('href'),'https://example.com/check-in');
    if (!remaining) {
    const popupPromise=context.waitForEvent('page',{timeout:5000});
    await dialog.getByRole('link',{name:'Apri link'}).click();const popup=await popupPromise;
    await popup.waitForURL('https://example.com/check-in',{timeout:5000}).catch(()=>{});
    assert.equal(popup.url(),'https://example.com/check-in');await popup.close();
    }
    await context.setOffline(true);
    await dialog.getByRole('button',{name:'Segna come completato',exact:true}).click();
    await dialog.waitFor({state:'hidden'});await page.waitForFunction(async()=> (await window.taskApi.all())[0].completed===true);
    await card.click();await page.getByRole('button',{name:/Modifica/}).click();
    await page.getByLabel('Nome Task *').fill('Confermare check-in');
    await page.getByLabel('Orario Task').fill('10:15');
    await page.getByRole('button',{name:'Salva Modifiche',exact:true}).click();
    await page.waitForFunction(async()=> (await window.taskApi.all())[0].titolo==='Confermare check-in');
    console.log('PASS back: description, link attributes, offline completion and editing');

    // 3. Reopen real IndexedDB; production timeline, split/merge and pending payload retain fields.
    await context.setOffline(false);
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});await page.locator('[data-task-card]').waitFor();
    const state=await page.evaluate(async()=>{
      const [task]=await window.taskApi.all(),timeline=await window.taskApi.timeline(),queue=await window.taskApi.queue();
      const parts=window.taskApi.splitEntitySecurityData('tappa','synthetic-task',task);
      const restored=window.taskApi.mergeEntitySecurityData(parts.publicDoc,parts.privateCredentialsDoc);
      return {task,timeline,queue,restored,unsafe:window.taskApi.getTaskLink('javascript:alert(1)')};
    });
    assert.equal(state.task.completed,true);assert.equal(state.task.orario,'10:15');assert.equal(state.task.link,'https://example.com/check-in');
    assert.equal(state.timeline.find(t=>t.id===state.task.id).physicalLocation,false);
    assert.equal(state.restored.link,state.task.link);assert.equal(state.restored.completed,true);
    assert.ok(state.queue.some(q=>q.data.completed&&q.data.orario==='10:15'));assert.equal(state.unsafe,undefined);
    await page.evaluate(()=>window.taskApi.add({titolo:'Sosta normale',sottocategoria:'Tappa',data:'2026-11-09',orario:'09:00',indirizzo:'Roma',coordinate:{lat:41.9,lng:12.5}}));
    const timeline=await page.evaluate(()=>window.taskApi.timeline());
    assert.equal(timeline.filter(t=>t.type==='tappa')[0].time,'09:00');
    assert.equal(timeline.filter(t=>t.type==='tappa')[1].time,'10:15');
    assert.equal(timeline.find(t=>t.title==='Sosta normale').physicalLocation,true);
    console.log('PASS reopening/sync: IndexedDB, chronological Oggi timeline, split/merge, queue retention and other Tappe');
    await page.locator('[data-task-card]').click();page.once('dialog',d=>d.accept());
    await page.getByRole('button',{name:/Elimina/}).click();
    await page.waitForFunction(async()=> (await window.taskApi.all()).every(t=>t.sottocategoria!=='Task'));
    assert.equal(pageErrors.length,0,pageErrors.join('\n'));
    console.log('PASS delete: existing storage/tombstone flow; no production requests');
  } finally {
    await browser?.close();await server.close();clearTimeout(deadline);
    assert.equal(path.dirname(fixture),root);fs.rmSync(fixture,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;clearTimeout(deadline);});
