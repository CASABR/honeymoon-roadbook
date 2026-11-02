import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, '..');
const rawArguments = process.argv.slice(2);
const command = rawArguments.shift();

function fail(message) {
  console.error(`Errore: ${message}`);
  process.exit(1);
}

function readOption(name) {
  const index = rawArguments.indexOf(name);
  return index >= 0 ? rawArguments[index + 1] : undefined;
}

function readRepeatedOption(name) {
  const values = [];
  rawArguments.forEach((argument, index) => {
    if (argument === name && rawArguments[index + 1]) values.push(rawArguments[index + 1]);
  });
  return values;
}

const approved = rawArguments.includes('--approve');
const root = path.resolve(readOption('--root') || defaultRoot);
const packagePath = path.join(root, 'package.json');
const packageLockPath = path.join(root, 'package-lock.json');
const historyPath = path.join(root, 'src', 'data', 'releaseHistory.json');
const draftPath = path.join(root, 'release-draft.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

function readJson(filePath) {
  if (!existsSync(filePath)) fail(`file mancante: ${path.relative(root, filePath)}`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeAtomic(filePath, content) {
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, content, 'utf8');
  renameSync(temporaryPath, filePath);
}

function writeJson(filePath, value) {
  writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`versione non SemVer: ${version}`);
  return match.slice(1).map(Number);
}

function bumpVersion(version, releaseType) {
  const [major, minor, patch] = parseVersion(version);
  if (releaseType === 'major') return `${major + 1}.0.0`;
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`;
  if (releaseType === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail('specifica patch, minor o major');
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('la data deve usare il formato YYYY-MM-DD');
  return value;
}

function validateNotes(notes) {
  if (notes.length < 1 || notes.length > 3) fail('servono da 1 a 3 note di rilascio');
  const sensitiveValue = /(?:pnr|e-?ticket|booking(?:\s*code)?|password|token|secret|credential)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{3,}/i;
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phone = /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,}/;
  for (const note of notes) {
    if (note.length > 180) fail('ogni nota deve restare entro 180 caratteri');
    if (sensitiveValue.test(note) || email.test(note) || phone.test(note)) {
      fail('una nota potrebbe contenere dati riservati');
    }
  }
}

function ensureCleanRepository() {
  if (!existsSync(path.join(root, '.git'))) return;
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
  if (status) fail('il worktree deve essere pulito prima di approvare una release');
}

function renderChangelog(history) {
  const sections = history.releases.map((release) => {
    const notes = release.changes.map((change) => `- ${change}`).join('\n');
    return `## ${release.version} — ${release.publishedAt}\n\n${notes}`;
  });
  return `# Cronologia aggiornamenti HOUNIGO\n\nQuesto file contiene esclusivamente versioni di cui è verificabile la pubblicazione. Le release preparate ma non ancora pubblicate restano fuori dalla cronologia visibile nell’app.\n\n${sections.join('\n\n')}\n`;
}

function updatePackageVersion(nextVersion) {
  const packageMetadata = readJson(packagePath);
  packageMetadata.version = nextVersion;
  writeJson(packagePath, packageMetadata);

  if (existsSync(packageLockPath)) {
    const packageLock = readJson(packageLockPath);
    packageLock.version = nextVersion;
    if (packageLock.packages?.['']) packageLock.packages[''].version = nextVersion;
    writeJson(packageLockPath, packageLock);
  }
}

if (command === 'prepare') {
  const releaseType = rawArguments.find((argument) => ['patch', 'minor', 'major'].includes(argument));
  const notes = readRepeatedOption('--note');
  const preparedAt = validateDate(readOption('--date') || new Date().toISOString().slice(0, 10));
  const packageMetadata = readJson(packagePath);
  const nextVersion = bumpVersion(packageMetadata.version, releaseType);
  validateNotes(notes);

  console.log(`Proposta release: ${packageMetadata.version} -> ${nextVersion} (${releaseType.toUpperCase()})`);
  console.log(`Note validate: ${notes.length}. Nessuna modifica applicata senza --approve.`);
  if (!approved) process.exit(0);

  ensureCleanRepository();
  if (existsSync(draftPath)) fail('esiste già una release in preparazione');
  updatePackageVersion(nextVersion);
  writeJson(draftPath, { version: nextVersion, preparedAt, changes: notes });
  console.log(`Release ${nextVersion} preparata. Pubblicala solo dopo verifica e approvazione finale.`);
} else if (command === 'publish') {
  const publishedAt = validateDate(readOption('--date') || '');
  const sourceCommit = readOption('--source');
  if (!/^[a-f0-9]{7,40}$/i.test(sourceCommit || '')) fail('specifica lo SHA sorgente con --source');
  const draft = readJson(draftPath);
  const packageMetadata = readJson(packagePath);
  const history = readJson(historyPath);
  validateNotes(draft.changes);
  if (packageMetadata.version !== draft.version) fail('package.json e release draft non coincidono');
  if (history.releases.some((release) => release.version === draft.version)) fail('versione già pubblicata');

  console.log(`Pubblicazione proposta: ${draft.version} del ${publishedAt}, sorgente ${sourceCommit.slice(0, 7)}.`);
  console.log('La cronologia pubblicata non cambia senza --approve.');
  if (!approved) process.exit(0);

  ensureCleanRepository();
  history.releases.unshift({
    version: draft.version,
    publishedAt,
    sourceCommit,
    changes: draft.changes,
  });
  writeJson(historyPath, history);
  writeAtomic(changelogPath, renderChangelog(history));
  rmSync(draftPath);
  console.log(`Release ${draft.version} aggiunta alla cronologia pubblicata.`);
} else {
  fail('usa "prepare patch|minor|major" oppure "publish"');
}
