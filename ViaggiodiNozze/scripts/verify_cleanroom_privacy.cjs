const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repoArg = process.argv.find(value => value.startsWith('--repo='));
const cleanRepo = repoArg ? path.resolve(repoArg.slice('--repo='.length)) : '';
if (!cleanRepo || !fs.existsSync(cleanRepo)) throw new Error('Specificare --repo=<worktree-cleanroom>');

const seedFiles = [
  'src/storage/seedActivities.ts', 'src/storage/seedAlloggi.ts', 'src/storage/seedRistoranti.ts',
  'src/storage/seedShopping.ts', 'src/storage/seedTappe.ts', 'src/storage/seedTransports.ts',
  'src/data/seedMilano29Dic.ts',
];
const markers = new Set();
const addMatches = (content, pattern, group = 0) => {
  for (const match of content.matchAll(pattern)) {
    const value = match[group]?.trim();
    if (value && value.length >= 4) markers.add(value);
  }
};
for (const relativePath of seedFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  addMatches(source, /(?:bookingCode|pinCode|ticketNumber|reservationCode|reference|email|phone)\s*:\s*['"`]([^'"`]+)['"`]/g, 1);
  addMatches(source, /(?<!\d)\d{3}[- ]?\d{7,10}(?!\d)|\b[A-Z0-9]{6}\b|#[A-Z]-\d{5,}/g);
}

const runGit = args => {
  const result = spawnSync('git', ['-C', cleanRepo, ...args], { encoding: null, maxBuffer: 1024 * 1024 * 256 });
  if (result.status !== 0) throw new Error(`git ${args[0]} fallito`);
  return result.stdout;
};

const objectLines = runGit(['rev-list', '--objects', '--all']).toString('utf8').trim().split(/\r?\n/).filter(Boolean);
const forbiddenSuffixes = new Set(seedFiles.map(value => `ViaggiodiNozze/${value}`));
const forbiddenPaths = objectLines.filter(line => {
  const filePath = line.slice(line.indexOf(' ') + 1);
  return [...forbiddenSuffixes].some(suffix => filePath.endsWith(suffix));
});
const objectIds = [...new Set(objectLines.map(line => line.split(' ')[0]))];
const batch = spawnSync('git', ['-C', cleanRepo, 'cat-file', '--batch'], {
  input: `${objectIds.join('\n')}\n`, encoding: null, maxBuffer: 1024 * 1024 * 512,
});
if (batch.status !== 0) throw new Error('git cat-file --batch fallito');

let offset = 0;
let markerHits = 0;
while (offset < batch.stdout.length) {
  const newline = batch.stdout.indexOf(10, offset);
  if (newline < 0) break;
  const header = batch.stdout.subarray(offset, newline).toString('utf8');
  offset = newline + 1;
  const parts = header.split(' ');
  const size = Number(parts[2] || 0);
  const body = batch.stdout.subarray(offset, offset + size);
  offset += size + 1;
  if (parts[1] !== 'blob' || body.includes(0)) continue;
  const text = body.toString('utf8');
  for (const marker of markers) {
    if (text.includes(marker)) markerHits += 1;
  }
}

console.log(`ref analizzati: ${runGit(['for-each-ref', '--format=%(refname)', 'refs/heads']).toString('utf8').trim().split(/\r?\n/).filter(Boolean).length}`);
console.log(`oggetti analizzati: ${objectIds.length}`);
console.log(`marker privati rilevati: ${markerHits}`);
console.log(`percorsi seed riservati rilevati: ${forbiddenPaths.length}`);
if (markerHits || forbiddenPaths.length) process.exitCode = 1;
else console.log('privacy cronologia cleanroom: PASS');
