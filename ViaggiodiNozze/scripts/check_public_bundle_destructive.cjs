// Verifica SOLA LETTURA del frontend pubblicato: cerca le firme delle vecchie cancellazioni automatiche.
const base = 'https://casabr.github.io/honeymoon-roadbook/';
const sigs = ['TRENO ROMA TERMINI - MILANO CENTRALE', 'CA950 + CA783', 'Errore deduplicazione forzata', 'DEDUPLICAZIONE FORZATA'];
(async () => {
  const html = await (await fetch(base + '?v=' + Date.now(), { cache: 'no-store' })).text();
  const entries = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(m => new URL(m[1], base).href);
  console.log('index.html JS:', entries);
  const sw = await (await fetch(base + 'sw.js?v=' + Date.now(), { cache: 'no-store' })).text();
  const files = [...new Set([...entries, ...[...sw.matchAll(/url:"([^"]+\.js)"/g)].map(m => new URL(m[1], base).href)])];
  console.log('JS verificati:', files.length);
  const hits = {};
  for (const f of files) {
    const t = await (await fetch(f)).text();
    for (const s of sigs) if (t.includes(s)) (hits[s] ||= []).push(f.split('/').pop());
  }
  console.log('Firme distruttive nel bundle pubblico:', JSON.stringify(hits, null, 1));
  const ver = html.match(/<meta[^>]+version[^>]*>/i);
  console.log('meta version:', ver && ver[0]);
  console.log('sw.js length', sw.length, 'precache entries', (sw.match(/revision/g) || []).length);
})().catch(e => console.error('ERR', e.message));
