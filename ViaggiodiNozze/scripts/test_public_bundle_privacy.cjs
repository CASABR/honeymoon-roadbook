const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const distArg = process.argv.find(value => value.startsWith('--dist='));
const distDir = distArg ? path.resolve(distArg.slice('--dist='.length)) : path.join(root, 'dist');
const seedFiles = [
  'src/storage/seedActivities.ts',
  'src/storage/seedAlloggi.ts',
  'src/storage/seedRistoranti.ts',
  'src/storage/seedShopping.ts',
  'src/storage/seedTappe.ts',
  'src/storage/seedTransports.ts',
  'src/data/seedMilano29Dic.ts',
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function addMatches(target, content, pattern, group = 0) {
  for (const match of content.matchAll(pattern)) {
    const value = match[group]?.trim();
    if (value && value.length >= 4) target.add(value);
  }
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist non trovata: eseguire npm run build prima del controllo privacy');
}

const distFiles = walk(distDir);
const textualFiles = distFiles.filter((file) => /\.(?:js|css|html|json|webmanifest|svg|md)$/i.test(file));
const publicText = textualFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const privateMarkers = new Set();

for (const relativePath of seedFiles) {
  // Private seeds are intentionally absent from the cleanroom repository.
  // Any reintroduced seed is still inspected and fails the source exclusion below.
  if (!fs.existsSync(path.join(root, relativePath))) continue;
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  addMatches(privateMarkers, source, /(?:bookingCode|pinCode|ticketNumber|reservationCode|reference|email|phone)\s*:\s*['"`]([^'"`]+)['"`]/g, 1);
  addMatches(privateMarkers, source, /(?<!\d)\d{3}[- ]?\d{7,10}(?!\d)|\b[A-Z0-9]{6}\b|#[A-Z]-\d{5,}/g);
}

const transportPath = path.join(root, 'src/storage/seedTransports.ts');
const transportSeed = fs.existsSync(transportPath) ? fs.readFileSync(transportPath, 'utf8') : '';
const nonPersonalLabels = new Set(['Globale', 'Internazionale']);
for (const match of transportSeed.matchAll(/bookingCode\s*:\s*['"`]([^'"`]+)['"`]/g)) {
  const labels = new Set();
  addMatches(labels, match[1], /\b[A-ZÀ-Ý][a-zà-ÿ]{3,}(?=\s*:)/g);
  for (const label of labels) {
    if (!nonPersonalLabels.has(label)) privateMarkers.add(label);
  }
}

const serviceAccountPath = path.join(root, 'serviceAccountKey.json');
if (fs.existsSync(serviceAccountPath)) {
  const credentials = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  for (const key of ['private_key_id', 'private_key', 'client_email', 'client_id']) {
    const value = credentials[key];
    if (typeof value === 'string' && value.length >= 4) privateMarkers.add(value);
  }
}

const exposedMarkers = [...privateMarkers].filter((value) => publicText.includes(value));
const seedChunks = distFiles.filter((file) => /(?:^|[\\/])seed(?:Activities|Alloggi|Ristoranti|Shopping|Tappe|Transports|Milano)/i.test(file));
const sourceMaps = distFiles.filter((file) => file.endsWith('.map'));
const forbiddenFiles = distFiles.filter((file) => /(?:^|[\\/])(?:serviceAccountKey|\.env|.*(?:backup|receipt|credential|secret|private).*)\.(?:json|txt|zip|pdf|pem|key)$/i.test(path.relative(distDir, file)));
const embeddedDocuments = distFiles.filter((file) => /\.(?:pdf|zip|docx?|xlsx?)$/i.test(file));
const runtimeFiles = walk(path.join(root, 'src')).filter((file) => /\.(?:ts|tsx)$/.test(file) && !seedFiles.some((seed) => file === path.join(root, seed)));
const runtimeText = runtimeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const runtimeSeedImports = runtimeText.match(/(?:from\s+['"][^'"]*seed|import\s*\(\s*['"][^'"]*seed)/gi) || [];
const storageSource = fs.readFileSync(path.join(root, 'src/storage/storageService.ts'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const onboardingSource = fs.readFileSync(path.join(root, 'src/views/OnboardingView.tsx'), 'utf8');
const disabledSeedMethods = [
  /async initInitialSeedData\(\): Promise<void> \{[\s\S]*?localStorage\.setItem\(SEED_FLAG_KEY, 'true'\);[\s\S]*?return;[\s\S]*?\n  \}/,
  /async ensureMasterTripSeedData\(\): Promise<void> \{\s*return;\s*\}/,
  /async ensureRefuels\(\): Promise<void> \{\s*return;\s*\}/,
  /async seedTransports\(force = false\): Promise<void> \{\s*void force;\s*return;\s*\}/,
  /async seedRealActivities\(\): Promise<void> \{\s*return;\s*\}/,
];
const seedMethodViolations = disabledSeedMethods.filter((pattern) => !pattern.test(storageSource));
const authenticatedLoadMissing = [
  !appSource.includes('new SyncService(tripConfig.id)'),
  !onboardingSource.includes('persistDeviceSession(targetTripId, finalRole)'),
  !onboardingSource.includes('saveTripConfig(finalConfig)'),
].filter(Boolean);
const swPath = path.join(distDir, 'sw.js');
const serviceWorker = fs.existsSync(swPath) ? fs.readFileSync(swPath, 'utf8') : '';
const precachedSeeds = serviceWorker.match(/seed(?:Activities|Alloggi|Ristoranti|Shopping|Tappe|Transports|Milano)/gi) || [];
const secretPatterns = [
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
  /"private_key"\s*:\s*"(?!")/,
  /"client_secret"\s*:\s*"(?!")/,
];
const genericSecretHits = secretPatterns.filter((pattern) => pattern.test(publicText));

// Negative controls keep exclusion checks effective even with no legacy seed fixtures.
assert.ok(secretPatterns.some(pattern => pattern.test('-----BEGIN PRIVATE KEY-----')));
assert.ok(secretPatterns.some(pattern => pattern.test('{"client_secret":"synthetic-sensitive-value"}')));
assert.match("import('./seedActivities')", /(?:from\s+['"][^'"]*seed|import\s*\(\s*['"][^'"]*seed)/i);
const privateSeedSources = walk(path.join(root, 'src')).filter(file => /(?:^|[\\/])seed(?:Activities|Alloggi|Ristoranti|Shopping|Tappe|Transports|Milano)/i.test(file));
const checks = [
  ['seed privati nelle sorgenti', privateSeedSources.length],
  ['valori privati', exposedMarkers.length],
  ['chunk seed', seedChunks.length],
  ['source map', sourceMaps.length],
  ['file riservati', forbiddenFiles.length],
  ['documenti embedded', embeddedDocuments.length],
  ['import seed runtime', runtimeSeedImports.length],
  ['metodi seed attivi', seedMethodViolations.length],
  ['caricamento autenticato mancante', authenticatedLoadMissing.length],
  ['seed nel precache', precachedSeeds.length],
  ['credenziali generiche', genericSecretHits.length],
];

for (const [label, count] of checks) {
  console.log(`${label}: ${count}`);
}

if (checks.some(([, count]) => count > 0)) {
  process.exit(1);
}

console.log(`controllo privacy bundle: OK (${distFiles.length} file)`);
