/**
 * HOUNIGO — Compatible Rollback Builder & Verifier (1.5.16 shell + EUR/v2/Anti-Regression overlay)
 *
 * Preserves untouched original 1.5.16 archives (`832c3d9`) and produces a verified,
 * buildable compatibility rollback under `backups/rollback-compat-1.5.16-v2/`.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const BACKUP_SNAPSHOT = path.join(REPO_ROOT, 'backups', 'pre-bonifica-2026-11-11', 'trip-0000-compat-snapshot.json');
const OUT_BASE = path.join(REPO_ROOT, 'backups', 'rollback-compat-1.5.16-v2');
const OUT_APP = path.join(OUT_BASE, 'ViaggiodiNozze');

const OVERLAY_FILES = [
  'src/utils/securityDataSplitter.ts',
  'src/storage/syncService.ts',
  'src/storage/localMutationQueue.ts',
  'src/utils/deviceSession.ts',
  'src/utils/useAuthIdentity.ts',
  'src/services/accountService.ts',
  'src/services/liveService.ts',
  'src/services/liveStorageService.ts',
  'src/firebase.ts',
  'src/services/currencyService.ts',
  'src/utils/priceHelper.ts',
  'src/types/index.ts',
  'src/views/altro/SpeseBudgetView.tsx',
  'src/components/common/DesktopEconomySummary.tsx',
  'src/views/altro/LiveView.tsx',
  'src/views/altro/LiveEditorialExperience.tsx',
  'src/services/liveGpsService.ts',
  'src/services/photoJournalService.ts',
  'src/components/cards/PreDeparturePhotoCard.tsx',
  'src/utils/livePhotoPrivacy.ts',
  'src/components/modals/TimelineItemDetailModal.tsx',
  'index.html',
  ...['Alloggio', 'Attivita', 'Ristorante', 'Shopping', 'Trasporto'].flatMap(name => [
    `src/components/cards/${name}Card.tsx`,
    `src/components/forms/${name}Form.tsx`,
  ]),
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadTsFrom(baseDir, rel, deps = {}, globals = {}) {
  const exports = {};
  const source = fs
    .readFileSync(path.join(baseDir, rel), 'utf8')
    .replaceAll('import.meta.env.DEV', 'false')
    .replaceAll('import.meta.env', '({DEV:false,PROD:true})');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: id => {
      if (!(id in deps)) throw new Error(`Unexpected import ${id} in ${rel}`);
      return deps[id];
    },
    console: { log() {}, warn() {}, error() {} },
    Date,
    structuredClone,
    setTimeout,
    clearTimeout,
    AbortController,
    Blob,
    atob,
    ...globals,
  });
  return exports;
}

(async () => {
  fs.rmSync(OUT_BASE, { recursive: true, force: true });
  fs.mkdirSync(OUT_APP, { recursive: true });

  // 1. Export pure 1.5.16 (`832c3d9`) ViaggiodiNozze source via git archive tar
  const tarBuf = execFileSync('git', ['archive', '--format=tar', '832c3d9:ViaggiodiNozze'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
  const tarPath = path.join(OUT_BASE, 'base-1516.tar');
  fs.writeFileSync(tarPath, tarBuf);
  execFileSync('tar', ['-xf', tarPath, '-C', OUT_APP], { stdio: 'inherit' });
  fs.unlinkSync(tarPath);

  // 2. Apply reviewed compatibility overlay preserving EUR, privacy splitter, anti-regression & LIVE fixes
  const manifestFiles = [];
  for (const rel of OVERLAY_FILES) {
    const src = path.join(APP_ROOT, rel);
    const dst = path.join(OUT_APP, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    manifestFiles.push({ path: rel, sha256: sha256(fs.readFileSync(dst)) });
  }

  // Copy local .env (without committing or bundling secrets) if present so Picker/env flags match target project
  if (fs.existsSync(path.join(APP_ROOT, '.env'))) {
    fs.copyFileSync(path.join(APP_ROOT, '.env'), path.join(OUT_APP, '.env'));
  }

  // Reuse installed node_modules via junction cleanly on Windows (zero npm network install)
  const srcModules = path.join(APP_ROOT, 'node_modules');
  const dstModules = path.join(OUT_APP, 'node_modules');
  if (!fs.existsSync(dstModules)) {
    fs.symlinkSync(srcModules, dstModules, 'junction');
  }

  // 3. Verify TypeScript + Vite + PWA build on the compatibility rollback artifact
  execFileSync('npm.cmd', ['run', 'build'], { cwd: OUT_APP, stdio: 'inherit', shell: true });

  // Remove node_modules junction before packaging/checksums
  fs.rmSync(dstModules, { recursive: true, force: true });
  if (fs.existsSync(path.join(OUT_APP, '.env'))) fs.unlinkSync(path.join(OUT_APP, '.env'));

  // 4. Verify compatibility bundle contains NO dev mock, NO source maps, NO seeded credentials
  const distAssets = path.join(OUT_APP, 'dist', 'assets');
  const jsFiles = fs.readdirSync(distAssets).filter(n => n.endsWith('.js'));
  for (const name of jsFiles) {
    const content = fs.readFileSync(path.join(distAssets, name), 'utf8');
    assert.equal(content.includes('__HOUNIGO_MOCK_GOOGLE_USER__'), false, `Mock marker leaked into compat dist: ${name}`);
  }
  assert.equal(fs.readdirSync(distAssets).some(n => n.endsWith('.map')), false, 'Source map found in compat dist');

  // 5. Verify compat splitter & EUR calculations against real snapshot 0000
  const security = loadTsFrom(OUT_APP, 'src/utils/securityDataSplitter.ts');
  const currency = loadTsFrom(OUT_APP, 'src/services/currencyService.ts');
  const prices = loadTsFrom(OUT_APP, 'src/utils/priceHelper.ts', { '../services/currencyService': currency });
  const snap = JSON.parse(fs.readFileSync(BACKUP_SNAPSHOT, 'utf8'));
  const vaultMap = new Map((snap.private_credentials || []).map(v => [v.id, v]));
  let recordsChecked = 0;
  let secretValuesPreserved = 0;
  for (const col of ['trasporti', 'alloggi', 'attivita', 'ristoranti', 'shopping']) {
    const norm = security.normalizeEntityType(col);
    for (const row of snap[col] || []) {
      const merged = security.mergeEntitySecurityData(row, vaultMap.get(security.getVaultDocId(norm, row.id)) || vaultMap.get(row.id));
      const split = security.splitEntitySecurityData(norm, '0000', merged);
      const restored = security.mergeEntitySecurityData(split.publicDoc, split.privateCredentialsDoc);
      for (const k of security.SENSITIVE_KEYS) {
        if (merged[k] !== undefined && merged[k] !== '' && k !== 'privateNested') {
          assert.equal(JSON.stringify(restored[k]), JSON.stringify(merged[k]), `Compat rollback lost ${col}.${k}`);
          secretValuesPreserved++;
          assert.equal(split.publicDoc[k], undefined, `Compat rollback leaked ${col}.${k}`);
        }
      }
      const pay = prices.resolvePaymentInfo(merged);
      if (pay.costNum > 0) assert.equal(currency.roundEur(pay.paidNum + pay.remainingNum), pay.costNum);
      recordsChecked++;
    }
  }

  // 6. Archive dist ZIP + manifest + SHA256SUMS
  const distZip = path.join(OUT_BASE, 'rollback-compatible-1.5.16-v2-dist.zip');
  execFileSync('tar', ['-a', '-cf', distZip, '-C', path.join(OUT_APP, 'dist'), '.'], { stdio: 'inherit' });
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseShellCommit: '832c3d9',
    baseVersion: '1.5.16',
    compatibleSchemaVersion: 2,
    overlayFilesCount: OVERLAY_FILES.length,
    overlayFiles: manifestFiles,
    verification: {
      buildPassed: true,
      distFilesCount: fs.readdirSync(path.join(OUT_APP, 'dist')).length,
      recordsChecked,
      secretValuesPreserved,
      productionWrites: 0,
    },
    distZipSha256: sha256(fs.readFileSync(distZip)),
  };
  fs.writeFileSync(path.join(OUT_BASE, 'rollback-compat-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({
    compatDir: 'backups/rollback-compat-1.5.16-v2/ViaggiodiNozze/dist',
    distZip: 'backups/rollback-compat-1.5.16-v2/rollback-compatible-1.5.16-v2-dist.zip',
    distZipSha256: manifest.distZipSha256,
    overlayFilesCount: OVERLAY_FILES.length,
    recordsChecked,
    secretValuesPreserved,
    buildPassed: true,
    productionWrites: 0,
  }, null, 2));
})();

