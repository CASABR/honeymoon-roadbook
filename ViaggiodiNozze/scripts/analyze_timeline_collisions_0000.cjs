// Analisi SOLA LETTURA delle collisioni orarie sul viaggio 0000 (snapshot locale post-apply).
// Replica la logica di storageService.getTimelineForDate distinguendo orari espliciti da default.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'docs', 'audit', 'roadbook-0000-2026-10-28', 'generated', 'proposed-after-sanitized.json');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const dates = new Set();
const items = [];
const push = (date, o) => { if (!date) return; dates.add(date); items.push({ date, ...o }); };

for (const t of d.trasporti || []) {
  const explicit = !!t.departureTime;
  push(t.date, { id: t.id, kind: 'trasporto', title: `${t.type} ${t.carrier || ''}`.trim(), start: t.departureTime || '00:00', end: t.arrivalTime && (!t.arrivalDate || t.arrivalDate === t.date) ? t.arrivalTime : null, explicit, pnr: t.bookingCode, status: t.status });
  if (t.arrivalDate && t.arrivalDate !== t.date) push(t.arrivalDate, { id: t.id + '_arrival', kind: 'trasporto', title: `Arrivo ${t.arrivalLocation || ''}`, start: t.arrivalTime || '00:00', end: null, explicit: !!t.arrivalTime, pnr: t.bookingCode, segmentOf: t.id });
}
for (const t of d.tappe || []) {
  const date = t.data || t.date; const time = t.orario || t.time;
  push(date, { id: t.id, kind: 'tappa', title: t.titolo, start: time || '10:00', end: null, explicit: !!time });
}
for (const a of d.attivita || []) {
  const time = a.time || a.orarioInizio || a.orarioRitrovo;
  push(a.date, { id: a.id, kind: 'attivita', title: a.title, start: time || '14:00', end: a.orarioFine || null, explicit: !!time });
}
for (const r of d.ristoranti || []) push(r.data || r.date, { id: r.id, kind: 'ristorante', title: r.nome, start: r.orario || '19:30', end: null, explicit: !!r.orario });
for (const s of d.shopping || []) push(s.data || s.date, { id: s.id, kind: 'shopping', title: s.nome, start: s.orario || '16:00', end: null, explicit: !!s.orario });
for (const acc of d.alloggi || []) {
  if (!acc.checkIn) continue;
  for (const day of [...dates]) { if (acc.checkOut ? (day >= acc.checkIn && day < acc.checkOut) : day === acc.checkIn) push(day, { id: acc.id, kind: 'alloggio', title: acc.name, start: '21:00', end: null, explicit: false, note: `checkInTime=${acc.checkInTime || '-'}` }); }
}

const byDate = {};
for (const it of items) (byDate[it.date] ||= []).push(it);
const report = [];
for (const date of Object.keys(byDate).sort()) {
  const list = byDate[date];
  const groups = {};
  for (const it of list) { if (it.start === '00:00' || it.id.endsWith('_state')) continue; (groups[it.start] ||= []).push(it); }
  for (const [time, g] of Object.entries(groups)) {
    if (g.length < 2) continue;
    const kinds = g.map(x => x.kind);
    const allDefault = g.every(x => !x.explicit);
    const anyDefault = g.some(x => !x.explicit);
    let cls = 'B';
    const pnrs = g.map(x => x.pnr).filter(Boolean);
    if (pnrs.length > 1 && new Set(pnrs).size === 1) cls = 'G';
    else if (allDefault) cls = 'E';
    else if (anyDefault) cls = 'E/B';
    const titles = new Set(g.map(x => (x.title || '').toLowerCase().trim()));
    if (titles.size < g.length && cls === 'B') cls = 'A?';
    report.push({ date, time, cls, items: g.map(x => `${x.kind}:${x.id}:${x.title}${x.explicit ? '' : ' [default]'}`) });
  }
  // sovrapposizioni intervalli espliciti
  const iv = list.filter(x => x.explicit && x.end && x.end > x.start);
  for (let i = 0; i < iv.length; i++) for (let j = i + 1; j < iv.length; j++) {
    if (iv[i].start < iv[j].end && iv[j].start < iv[i].end && iv[i].start !== iv[j].start) report.push({ date, time: `${iv[i].start}-${iv[i].end} vs ${iv[j].start}-${iv[j].end}`, cls: 'C', items: [iv[i], iv[j]].map(x => `${x.kind}:${x.id}:${x.title}`) });
  }
}
console.log(`Sorgente: ${path.basename(file)}  | elementi timeline: ${items.length} | collisioni/sovrapposizioni: ${report.length}`);
const summary = {};
for (const r of report) summary[r.cls] = (summary[r.cls] || 0) + 1;
console.log('Per classe:', JSON.stringify(summary));
for (const r of report) console.log(`\n[${r.cls}] ${r.date} ${r.time}\n  - ` + r.items.join('\n  - '));
