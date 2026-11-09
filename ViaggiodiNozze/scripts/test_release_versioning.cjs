const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const packageMetadata = JSON.parse(read('package.json'));
const releaseHistory = JSON.parse(read('src/data/releaseHistory.json'));
const appInfoSource = read('src/components/common/AppInfo.tsx');
const appSource = read('src/App.tsx');
const desktopNavigationSource = read('src/components/common/DesktopNavigation.tsx');
const settingsSource = read('src/components/common/SettingsMenu.tsx');
const updateToastSource = read('src/components/common/UpdateToast.tsx');
const viteSource = read('vite.config.ts');

assert.match(packageMetadata.version, /^\d+\.\d+\.\d+$/, 'package.json deve contenere una versione SemVer');
assert.ok(
  releaseHistory.releases.some((release) => release.version === packageMetadata.version) ||
  (existsSync(path.join(root, 'release-draft.json')) && JSON.parse(read('release-draft.json')).version === packageMetadata.version),
  'la versione installata deve avere una release pubblicata o preparata verificabile'
);
assert.ok(releaseHistory.releases.length <= 10, 'la cronologia distribuita deve restare compatta');

for (let index = 0; index < releaseHistory.releases.length; index += 1) {
  const release = releaseHistory.releases[index];
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.match(release.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(release.sourceCommit, /^[a-f0-9]{7,40}$/i);
  assert.ok(release.changes.length >= 1 && release.changes.length <= 3);
  if (index > 0) {
    assert.ok(
      releaseHistory.releases[index - 1].publishedAt >= release.publishedAt,
      'le release devono essere ordinate dalla più recente'
    );
  }
}

const publicReleaseText = releaseHistory.releases.flatMap((release) => release.changes).join('\n');
const sensitivePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:pnr|e-?ticket|booking(?:\s*code)?|password|token|secret|credential)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{3,}/i,
  /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,}/,
];
sensitivePatterns.forEach((pattern) => assert.doesNotMatch(publicReleaseText, pattern));

assert.match(appInfoSource, /Informazioni su HOUNIGO/);
assert.match(appInfoSource, /import \{ Info \} from 'lucide-react'/);
assert.match(appInfoSource, /<Info[^>]+size=\{18\}/);
assert.match(appInfoSource, /h-11 w-11 md:h-9 md:w-9/);
assert.doesNotMatch(appInfoSource, /ⓘ/);
assert.match(appInfoSource, /releaseHistory\.json/);
assert.match(appInfoSource, /<Modal/);
assert.match(appInfoSource, /centered/);
assert.doesNotMatch(appInfoSource, /firebase|firestore|getDoc|onSnapshot|fetch\(/i);
assert.match(appSource, /<AppInfoButton/);
assert.match(appSource, /<AppInfoModal/);
assert.match(desktopNavigationSource, /<AppInfoButton/);
assert.match(settingsSource, /HOUNIGO v\{APP_VERSION\}/);
assert.match(updateToastSource, /setAppUpdateAvailable\(needRefresh\)/);
assert.match(viteSource, /readFileSync\(path\.resolve\(__dirname, "package\.json"/);
assert.match(viteSource, /__APP_VERSION__:\s*JSON\.stringify\(packageMetadata\.version\)/);

const sourceFiles = [];
function collectSourceFiles(directory) {
  for (const entry of require('node:fs').readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(fullPath);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) sourceFiles.push(fullPath);
  }
}
collectSourceFiles(path.join(root, 'src'));
const serviceWorkerRegistrations = sourceFiles.reduce(
  (total, filePath) => total + (readFileSync(filePath, 'utf8').match(/useRegisterSW\s*\(/g) || []).length,
  0
);
assert.equal(serviceWorkerRegistrations, 1, 'deve esistere una sola registrazione PWA React');

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'hounigo-release-test-'));
try {
  mkdirSync(path.join(fixtureRoot, 'src', 'data'), { recursive: true });
  writeFileSync(path.join(fixtureRoot, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`);
  writeFileSync(
    path.join(fixtureRoot, 'package-lock.json'),
    `${JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2)}\n`
  );
  writeFileSync(
    path.join(fixtureRoot, 'src', 'data', 'releaseHistory.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      releases: [{
        version: '1.0.0',
        publishedAt: '2026-10-29',
        sourceCommit: 'abcdef0',
        changes: ['Versione iniziale del fixture di test.'],
      }],
    }, null, 2)}\n`
  );
  const releaseScript = path.join(root, 'scripts', 'prepare-release.mjs');
  const note = 'Migliorata la leggibilità della cronologia aggiornamenti.';
  const runRelease = (argumentsList) => execFileSync(process.execPath, [releaseScript, ...argumentsList], { encoding: 'utf8' });

  const beforeDryRun = readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8');
  const proposal = runRelease(['prepare', 'patch', '--root', fixtureRoot, '--date', '2026-10-30', '--note', note]);
  assert.match(proposal, /1\.0\.0 -> 1\.0\.1/);
  assert.equal(readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8'), beforeDryRun, 'la proposta non deve modificare file');

  runRelease(['prepare', 'patch', '--root', fixtureRoot, '--date', '2026-10-30', '--note', note, '--approve']);
  assert.equal(JSON.parse(readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8')).version, '1.0.1');
  assert.equal(JSON.parse(readFileSync(path.join(fixtureRoot, 'package-lock.json'), 'utf8')).version, '1.0.1');
  assert.ok(existsSync(path.join(fixtureRoot, 'release-draft.json')));
  assert.equal(JSON.parse(readFileSync(path.join(fixtureRoot, 'src', 'data', 'releaseHistory.json'), 'utf8')).releases[0].version, '1.0.0');

  runRelease(['publish', '--root', fixtureRoot, '--date', '2026-10-31', '--source', 'abcdef1']);
  assert.equal(JSON.parse(readFileSync(path.join(fixtureRoot, 'src', 'data', 'releaseHistory.json'), 'utf8')).releases[0].version, '1.0.0');

  runRelease(['publish', '--root', fixtureRoot, '--date', '2026-10-31', '--source', 'abcdef1', '--approve']);
  const publishedHistory = JSON.parse(readFileSync(path.join(fixtureRoot, 'src', 'data', 'releaseHistory.json'), 'utf8'));
  assert.equal(publishedHistory.releases[0].version, '1.0.1');
  assert.equal(existsSync(path.join(fixtureRoot, 'release-draft.json')), false);
  assert.match(readFileSync(path.join(fixtureRoot, 'CHANGELOG.md'), 'utf8'), /## 1\.0\.1 — 2026-10-31/);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('Versioning HOUNIGO: 24 controlli superati.');
