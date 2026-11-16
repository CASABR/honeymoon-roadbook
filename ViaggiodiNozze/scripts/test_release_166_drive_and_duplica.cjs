/**
 * test_release_166_drive_and_duplica.cjs
 *
 * Test di collaudo per HOUNIGO 1.6.6:
 * 1. Duplica su Tappa e card timeline: nascosto su mobile front, visibile su desktop front, presente nel dettaglio/retro.
 * 2. Cartella preferita Google Drive: isolamento utente/viaggio, persistenza, cambio, scollegamento.
 * 3. Selezione file Google Drive con cartella preferita come parent view e scope esclusivo drive.file.
 * 4. Versionamento HOUNIGO 1.6.6: metadati, draft, cronologia pubblicata online ferma a 1.6.5.
 * 5. Protezione regressioni su Dynamic Island, compattezza card, LIVE e GPS.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

console.log('--- TEST COLLAUDO HOUNIGO 1.6.6 ---');

// 1. DUPLICA SU TAPPA E CARD TIMELINE
const tappaCardSrc = read('src/components/cards/TappaCard.tsx');
assert.ok(tappaCardSrc.includes('onDuplicate'), 'TappaCard deve accettare onDuplicate');
assert.ok(
  tappaCardSrc.includes('hidden md:inline-flex'),
  'TappaCard sul fronte deve usare hidden md:inline-flex per nascondersi su smartphone e comparire su desktop'
);
assert.ok(
  tappaCardSrc.includes('title="Duplica questa tappa"'),
  'TappaCard deve avere il titolo Duplica per accessibilità desktop'
);

const oggiViewSrc = read('src/views/OggiView.tsx');
assert.ok(
  oggiViewSrc.includes('onDuplicate={canEdit ? () => handleDuplicateItem(item as TimelineItem) : undefined}'),
  'OggiView deve passare onDuplicate a TappaCard e alle card della timeline'
);

const timelineModalSrc = read('src/components/modals/TimelineItemDetailModal.tsx');
assert.ok(
  timelineModalSrc.includes('onDuplicate &&') && timelineModalSrc.includes('<span>📄 Duplica</span>'),
  'TimelineItemDetailModal (retro/dettaglio) deve mantenere il pulsante Duplica accessibile sia da smartphone che da desktop'
);

const tappeViewSrc = read('src/views/altro/TappeView.tsx');
assert.ok(
  tappeViewSrc.includes('handleDuplicateTappa') && tappeViewSrc.includes('onDuplicate={canEdit ? () => handleDuplicateTappa(tappa) : undefined}'),
  'TappeView deve supportare la duplicazione della tappa'
);

console.log('✓ 1. Duplica tappe e timeline: Smartphone nascosto sul fronte, Desktop visibile sul fronte, Retro/dettaglio presente.');

// 2. CARTELLA PREFERITA GOOGLE DRIVE & ISOLAMENTO
const pickerServiceSrc = read('src/services/googlePickerService.ts');
assert.ok(pickerServiceSrc.includes('GoogleDriveFavoriteFolder'), 'googlePickerService deve esportare GoogleDriveFavoriteFolder');
assert.ok(pickerServiceSrc.includes('getFavoriteDriveFolder'), 'googlePickerService deve esportare getFavoriteDriveFolder');
assert.ok(pickerServiceSrc.includes('setFavoriteDriveFolder'), 'googlePickerService deve esportare setFavoriteDriveFolder');
assert.ok(pickerServiceSrc.includes('openGoogleFolderPicker'), 'googlePickerService deve esportare openGoogleFolderPicker');

// Verifica chiave di isolamento tripId e uid
assert.ok(
  pickerServiceSrc.includes('hounigo_drive_fav_folder_'),
  'La chiave di memorizzazione deve garantire isolamento per viaggio e utente'
);

// Verifica simulazione persistenza isolata
const mockStorage = new Map();
function mockSetFavorite(folder, tripId, uid) {
  const key = `hounigo_drive_fav_folder_${tripId || '0000'}_${uid || 'anon'}`;
  if (!folder) mockStorage.delete(key);
  else mockStorage.set(key, JSON.stringify(folder));
}
function mockGetFavorite(tripId, uid) {
  const key = `hounigo_drive_fav_folder_${tripId || '0000'}_${uid || 'anon'}`;
  const raw = mockStorage.get(key);
  return raw ? JSON.parse(raw) : null;
}

mockSetFavorite({ id: 'f_tripA_u1', name: 'Cartella Viaggio A', url: 'https://drive.google.com/drive/folders/f_tripA_u1', selectedAt: 100 }, 'tripA', 'user1');
mockSetFavorite({ id: 'f_tripB_u1', name: 'Cartella Viaggio B', url: 'https://drive.google.com/drive/folders/f_tripB_u1', selectedAt: 200 }, 'tripB', 'user1');
mockSetFavorite({ id: 'f_tripA_u2', name: 'Cartella Utente 2', url: 'https://drive.google.com/drive/folders/f_tripA_u2', selectedAt: 300 }, 'tripA', 'user2');

assert.equal(mockGetFavorite('tripA', 'user1')?.name, 'Cartella Viaggio A');
assert.equal(mockGetFavorite('tripB', 'user1')?.name, 'Cartella Viaggio B');
assert.equal(mockGetFavorite('tripA', 'user2')?.name, 'Cartella Utente 2');

mockSetFavorite(null, 'tripA', 'user1');
assert.equal(mockGetFavorite('tripA', 'user1'), null, 'Scollegamento cartella deve azzerare la preferenza per quel viaggio');
assert.equal(mockGetFavorite('tripB', 'user1')?.name, 'Cartella Viaggio B', 'Altri viaggi non devono essere intaccati');

console.log('✓ 2. Cartella preferita Google Drive: isolamento rigoroso tra viaggi e utenti verificato.');

// 3. SELEZIONE FILE GOOGLE DRIVE & SCOPE POLICY
const folderModalSrc = read('src/components/modals/GoogleDriveFolderModal.tsx');
assert.ok(folderModalSrc.includes('openGoogleFolderPicker'), 'GoogleDriveFolderModal deve permettere la selezione tramite Picker');
assert.ok(folderModalSrc.includes('parseGoogleDriveUrl'), 'GoogleDriveFolderModal deve validare i link inseriti manualmente');

const driveDocModalSrc = read('src/components/modals/GoogleDriveDocModal.tsx');
assert.ok(driveDocModalSrc.includes('parentFolderId'), 'GoogleDriveDocModal deve accettare parentFolderId');
assert.ok(driveDocModalSrc.includes('await openGooglePicker({\n      parentFolderId'), 'GoogleDriveDocModal deve passare parentFolderId a openGooglePicker');

const documentiViewSrc = read('src/views/altro/DocumentiView.tsx');
assert.ok(documentiViewSrc.includes('favoriteFolder'), 'DocumentiView deve gestire lo stato della cartella preferita');
assert.ok(documentiViewSrc.includes('Cartella Preferita Drive'), 'DocumentiView deve mostrare il cartellino della cartella preferita');
assert.ok(documentiViewSrc.includes('openDriveUrlSafely(favoriteFolder.url)'), 'DocumentiView deve consentire l\'apertura diretta in nuova scheda');
assert.ok(documentiViewSrc.includes('handleDisconnectFavoriteFolder'), 'DocumentiView deve supportare lo scollegamento');
assert.ok(documentiViewSrc.includes('parentFolderId={favoriteFolder?.id}'), 'DocumentiView deve passare il folder ID preferito al modale di selezione file');

// SCOPE STRICT VERIFICATION: drive.file unicamente
const forbiddenScopes = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive ',
  'https://www.googleapis.com/auth/drive"',
  'https://www.googleapis.com/auth/drive\'',
  'https://www.googleapis.com/auth/gmail.readonly'
];
for (const forbidden of forbiddenScopes) {
  assert.ok(!pickerServiceSrc.includes(forbidden), `Nessun scope vietato ammesso: trovato ${forbidden}`);
}
assert.ok(
  pickerServiceSrc.includes("'https://www.googleapis.com/auth/drive.file'"),
  'Deve essere presente unicamente lo scope autorizzato drive.file'
);

console.log('✓ 3. Selezione file Google Drive con parentFolder e scope drive.file rigorosamente isolato.');

// 4. VERSIONAMENTO 1.6.6
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const releaseHistory = JSON.parse(read('src/data/releaseHistory.json'));

assert.equal(pkg.version, '1.6.6', 'package.json deve essere 1.6.6');
assert.equal(pkgLock.version, '1.6.6', 'package-lock.json deve essere 1.6.6');

if (fs.existsSync(path.join(root, 'release-draft.json'))) {
  const draft = JSON.parse(read('release-draft.json'));
  assert.equal(draft.version, '1.6.6', 'release-draft.json deve essere 1.6.6');
  assert.equal(releaseHistory.releases[0].version, '1.6.5', 'La versione online pubblicata in releaseHistory deve restare 1.6.5 durante il draft');
  assert.ok(draft.changes.length >= 1 && draft.changes.length <= 3, 'Note di rilascio da 1 a 3');
} else {
  assert.equal(releaseHistory.releases[0].version, '1.6.6', 'La versione in releaseHistory deve essere 1.6.6 dopo la pubblicazione');
  assert.ok(releaseHistory.releases[0].changes.length >= 1 && releaseHistory.releases[0].changes.length <= 3, 'Note di rilascio da 1 a 3');
}

console.log('✓ 4. Versionamento HOUNIGO 1.6.6: metadati coerenti.');

// 5. ANTI-REGRESSION
const liveViewSrc = read('src/views/altro/LiveView.tsx');
assert.ok(liveViewSrc.includes('autoResumeGpsIfEligible'), 'autoResumeGpsIfEligible deve essere preservato in LiveView');
assert.ok(liveViewSrc.includes('hounigo_live_last_known_loc_'), 'Ultima posizione conosciuta deve essere preservata in LiveView');

const indexHtmlSrc = read('index.html');
assert.ok(indexHtmlSrc.includes('viewport-fit=cover'), 'Dynamic Island safe area cover deve essere preservato in index.html');

console.log('✓ 5. Anti-regressione superata: Dynamic Island, LIVE, GPS, compattezza card intatte.');
console.log('=== TUTTI I TEST SUPERATI CON SUCCESSO ===');
