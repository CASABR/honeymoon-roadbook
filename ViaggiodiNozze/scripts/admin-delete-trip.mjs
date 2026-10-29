#!/usr/bin/env node
/**
 * admin-delete-trip.mjs — Cancellazione amministrativa SICURA di un viaggio (ambiente privilegiato).
 *
 * Uso:
 *   node scripts/admin-delete-trip.mjs --trip-id=<ID>                       # RICOGNIZIONE (sola lettura, default)
 *   node scripts/admin-delete-trip.mjs --trip-id=<ID> --execute --confirm-id=<ID>   # ESECUZIONE
 *
 * Garanzie:
 *  - 0000 (e ID vuoti/con "/") sono rifiutati in modo permanente, in ogni modalità.
 *  - Senza --execute E --confirm-id identico a --trip-id non scrive nulla.
 *  - Enumera ricorsivamente TUTTI i discendenti (showMissing=true: include documenti "fantasma" orfani)
 *    di trips/{id} e live_feeds/{id}; mai percorsi fuori da questi due prefissi.
 *  - Backup completo (privato, ignorato da git) PRIMA di qualsiasi scrittura; senza backup non si cancella.
 *  - Journal riprendibile: rieseguendo lo stesso comando si riprende, senza toccare altri viaggi.
 *  - Elimina dal più profondo al documento radice; poi RILEGGE: successo dichiarato solo se residui == 0.
 *  - Nessuna credenziale viene stampata o salvata.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PROJECT = 'app-viaggio-di-nozze';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DOC_PREFIX = `projects/${PROJECT}/databases/(default)/documents/`;
const PROTECTED_IDS = new Set(['0000']);
const OUT_DIR = 'docs/audit/trip-deletion/private';

const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const tripId = (arg('trip-id') || '').trim();
const confirmId = (arg('confirm-id') || '').trim();
const execute = process.argv.includes('--execute');

export function validateTripId(id) {
  if (!id) throw new Error('--trip-id mancante');
  if (/[\/\s]/.test(id) || id === '.' || id === '..') throw new Error(`ID non valido: "${id}"`);
  if (PROTECTED_IDS.has(id)) throw new Error(`Viaggio ${id} PROTETTO: cancellazione rifiutata in modo permanente.`);
  return id;
}

async function getToken() {
  const cfg = JSON.parse(await readFile('C:/Users/CUSI/.config/configstore/firebase-tools.json', 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      grant_type: 'refresh_token',
      refresh_token: cfg.tokens.refresh_token
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token OAuth non ottenuto');
  return data.access_token;
}

async function api(token, url, init = {}, retries = 4) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    if (res.status === 429 || res.status >= 500) {
      if (i >= retries) throw new Error(`HTTP ${res.status} persistente su ${url.split('?')[0]}: ${await res.text()}`);
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
      continue;
    }
    return res;
  }
}

/** Enumera ricorsivamente tutti i documenti (anche "fantasma") sotto un percorso documento relativo. */
async function enumerateDescendants(token, docPath, out) {
  const res = await api(token, `${BASE}/${docPath}:listCollectionIds`, { method: 'POST', body: '{}' });
  if (!res.ok) throw new Error(`listCollectionIds ${docPath}: HTTP ${res.status} ${await res.text()}`);
  const { collectionIds = [] } = await res.json();
  for (const col of collectionIds) {
    let pageToken = '';
    do {
      const url = `${BASE}/${docPath}/${col}?pageSize=300&showMissing=true&mask.fieldPaths=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const r = await api(token, url);
      if (!r.ok) throw new Error(`list ${docPath}/${col}: HTTP ${r.status} ${await r.text()}`);
      const j = await r.json();
      for (const d of j.documents || []) {
        const rel = d.name.slice(DOC_PREFIX.length);
        out.add(rel);
        await enumerateDescendants(token, rel, out);
      }
      pageToken = j.nextPageToken || '';
    } while (pageToken);
  }
}

async function collect(token, id) {
  const all = new Set();
  const roots = [`trips/${id}`, `live_feeds/${id}`];
  const rootState = {};
  for (const root of roots) {
    const r = await api(token, `${BASE}/${root}`);
    rootState[root] = r.status === 200 ? 'presente' : r.status === 404 ? 'assente' : `errore HTTP ${r.status}`;
    if (r.status === 200) all.add(root);
    await enumerateDescendants(token, root, all);
  }
  for (const p of all) {
    if (!(p === `trips/${id}` || p.startsWith(`trips/${id}/`) || p === `live_feeds/${id}` || p.startsWith(`live_feeds/${id}/`))) {
      throw new Error(`Percorso fuori ambito rilevato, abort: ${p}`);
    }
  }
  return { paths: [...all], rootState };
}

const depth = p => p.split('/').length;
const bySub = (paths, id) => paths.reduce((m, p) => { const k = p.split('/').slice(0, 3).join('/'); m[k] = (m[k] || 0) + 1; return m; }, {});

async function backup(token, id, paths) {
  await mkdir(OUT_DIR, { recursive: true });
  const docs = [];
  for (const p of paths) {
    const r = await api(token, `${BASE}/${p}`);
    if (r.status === 200) docs.push(await r.json());
    else if (r.status !== 404) throw new Error(`Backup ${p}: HTTP ${r.status}`);
  }
  const file = path.join(OUT_DIR, `backup-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(file, JSON.stringify({ tripId: id, takenAt: new Date().toISOString(), count: docs.length, docs }, null, 1));
  return { file, count: docs.length };
}

async function deletePaths(token, paths, journalFile) {
  const ordered = [...paths].sort((a, b) => depth(b) - depth(a));
  let done = 0;
  for (let i = 0; i < ordered.length; i += 20) {
    const chunk = ordered.slice(i, i + 20);
    const res = await api(token, `${BASE.replace('/documents', '')}/documents:batchWrite`, {
      method: 'POST',
      body: JSON.stringify({ writes: chunk.map(p => ({ delete: `${DOC_PREFIX}${p}` })) })
    });
    if (!res.ok) throw new Error(`batchWrite fallita (${res.status}): ${await res.text()}`);
    const j = await res.json();
    const failed = (j.status || []).map((s, k) => ({ s, p: chunk[k] })).filter(x => x.s.code && x.s.code !== 0);
    if (failed.length) throw new Error(`Cancellazione fallita per ${failed.length} documenti, primo: ${failed[0].p} (${failed[0].s.message})`);
    done += chunk.length;
    await writeFile(journalFile, JSON.stringify({ lastUpdate: new Date().toISOString(), deleted: done, total: ordered.length }));
  }
  return done;
}

async function main() {
  const id = validateTripId(tripId);
  console.log(`Viaggio: ${id} | Modalità: ${execute ? 'ESECUZIONE' : 'RICOGNIZIONE (sola lettura)'}`);
  const token = await getToken();
  const { paths, rootState } = await collect(token, id);
  console.log('Stato radici:', JSON.stringify(rootState));
  console.log(`Documenti totali da eliminare: ${paths.length}`);
  console.log('Per sottocollezione:', JSON.stringify(bySub(paths, id)));
  if (!execute) { console.log('Nessuna scrittura eseguita. Per procedere: --execute --confirm-id=' + id); return; }
  if (confirmId !== id) throw new Error('--confirm-id deve essere identico a --trip-id');
  if (paths.length === 0) { console.log('Nulla da eliminare: viaggio già completamente assente.'); return; }

  const bk = await backup(token, id, paths);
  if (!existsSync(bk.file) || bk.count === 0) throw new Error('Backup non verificato: cancellazione annullata');
  console.log(`Backup privato verificato: ${bk.count} documenti -> ${bk.file}`);

  await mkdir(OUT_DIR, { recursive: true });
  const deleted = await deletePaths(token, paths, path.join(OUT_DIR, `journal-${id}.json`));
  console.log(`Eliminati ${deleted} documenti. Verifica finale…`);

  const after = await collect(token, id);
  if (after.paths.length > 0) {
    console.error(`INCOMPLETO: ${after.paths.length} documenti residui. Rieseguire lo stesso comando per riprendere.`);
    console.error('Residui per sottocollezione:', JSON.stringify(bySub(after.paths, id)));
    process.exitCode = 2;
    return;
  }
  console.log('COMPLETATO e VERIFICATO: nessun documento residuo.');
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('admin-delete-trip.mjs')) {
  main().catch(e => { console.error('ERRORE:', e.message); process.exitCode = 1; });
}
