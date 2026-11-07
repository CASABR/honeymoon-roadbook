const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../src/storage/syncService.ts');
let code = fs.readFileSync(targetPath, 'utf8');

// Replacement for save in pushToCloud
const targetSaveLF = `const cleanPayload = this.cleanUndefinedValues(payloadToSync);\n      await setDoc(docRef, cleanPayload, { merge: true });`;
const targetSaveCRLF = `const cleanPayload = this.cleanUndefinedValues(payloadToSync);\r\n      await setDoc(docRef, cleanPayload, { merge: true });`;

const replacementSaveLF = `const normType = normalizeEntityType(collectionName);
      const isOperationalWithCreds = ['alloggio', 'trasporto', 'attivita', 'tappa', 'ristorante', 'shopping', 'documento'].includes(normType);

      if (isOperationalWithCreds) {
        const { publicDoc, privateCredentialsDoc } = splitEntitySecurityData(
          normType as any,
          this.tripId,
          payloadToSync
        );

        const cleanPublic = this.cleanUndefinedValues(publicDoc);
        await setDoc(docRef, cleanPublic, { merge: true });

        if (privateCredentialsDoc && isCloudAuthorized()) {
          const vaultId = getVaultDocId(normType, data.id);
          const privDocRef = doc(db, 'trips', this.tripId, 'private_credentials', vaultId);
          await setDoc(privDocRef, this.cleanUndefinedValues(privateCredentialsDoc), { merge: true });
        } else if (!privateCredentialsDoc && isCloudAuthorized()) {
          const vaultId = getVaultDocId(normType, data.id);
          await deleteDoc(doc(db, 'trips', this.tripId, 'private_credentials', vaultId)).catch(() => {});
          if (vaultId !== data.id) {
            await deleteDoc(doc(db, 'trips', this.tripId, 'private_credentials', data.id)).catch(() => {});
          }
        }
      } else {
        const cleanPayload = this.cleanUndefinedValues(payloadToSync);
        await setDoc(docRef, cleanPayload, { merge: true });
      }`;

const replacementSaveCRLF = replacementSaveLF.replace(/\n/g, '\r\n');

if (code.includes(targetSaveCRLF)) {
  code = code.replace(targetSaveCRLF, replacementSaveCRLF);
  console.log('Sostituito save target (CRLF)');
} else if (code.includes(targetSaveLF)) {
  code = code.replace(targetSaveLF, replacementSaveLF);
  console.log('Sostituito save target (LF)');
} else {
  console.warn('ATTENZIONE: save target non trovato!');
}

// Replacement for role change listener
const targetRoleLF = `      if (role === 'owner' || role === 'copilota') {\n        console.log(\`[SyncService] Rilevato ruolo autorizzato (\${role}): trigger sincronizzazione automatica.\`);\n        this.flushPendingPushes().catch(() => {});\n        this.requestInitialSync('cloud_role_authorized');\n      }`;
const targetRoleCRLF = targetRoleLF.replace(/\n/g, '\r\n');

const replacementRoleLF = `      if (role === 'owner' || role === 'copilota') {\n        console.log(\`[SyncService] Rilevato ruolo autorizzato (\${role}): trigger sincronizzazione automatica.\`);\n        this.flushPendingPushes().catch(() => {});\n        this.requestInitialSync('cloud_role_authorized');\n      } else if (role === 'viewer' || role === 'unverified') {\n        console.log(\`[SyncService] Rilevato ruolo non privilegiato (\${role}): avvio bonifica cache locale.\`);\n        this.purgeSensitiveLocalCache().catch(() => {});\n      }`;
const replacementRoleCRLF = replacementRoleLF.replace(/\n/g, '\r\n');

if (code.includes(targetRoleCRLF)) {
  code = code.replace(targetRoleCRLF, replacementRoleCRLF);
  console.log('Sostituito role target (CRLF)');
} else if (code.includes(targetRoleLF)) {
  code = code.replace(targetRoleLF, replacementRoleLF);
  console.log('Sostituito role target (LF)');
} else {
  console.warn('ATTENZIONE: role target non trovato!');
}

fs.writeFileSync(targetPath, code, 'utf8');
console.log('Applicazione completata.');
