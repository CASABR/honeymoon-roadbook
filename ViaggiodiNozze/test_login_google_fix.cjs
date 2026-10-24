const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TEST UNITARIO: GESTIONE ERRORI LOGIN GOOGLE ED EMAIL ===');

// Leggiamo accountService.ts per verificare la mappatura degli errori
const accountServiceSource = fs.readFileSync(path.join(__dirname, 'src', 'services', 'accountService.ts'), 'utf8');

// 1. Verifica gestione popup-closed-by-user
assert(accountServiceSource.includes("auth/popup-closed-by-user"), 'Deve gestire auth/popup-closed-by-user');
assert(accountServiceSource.includes("Finestra popup di Google chiusa o bloccata"), 'Deve fornire messaggio chiaro in italiano per popup chiuso');

// 2. Verifica gestione account-exists-with-different-credential
assert(accountServiceSource.includes("auth/account-exists-with-different-credential"), 'Deve gestire account-exists-with-different-credential');
assert(accountServiceSource.includes("già registrato con Email e Password"), 'Deve indirizzare al login Email e Password');

// 3. Verifica assenza di async prima di signInWithPopup
const googleLoginFn = accountServiceSource.slice(accountServiceSource.indexOf('export async function loginWithGoogle'));
const signInIndex = googleLoginFn.indexOf('signInWithPopup');
const firstAwait = googleLoginFn.indexOf('await');
assert(signInIndex === firstAwait + 6, 'signInWithPopup deve essere la primissima operazione await eseguita (user gesture intatta)');

console.log('[PASS 01] Mappatura esplicita popup-closed-by-user verificata.');
console.log('[PASS 02] Mappatura account-exists-with-different-credential verificata.');
console.log('[PASS 03] Chiamata diretta e immediata a signInWithPopup verificata.');
console.log('TUTTI I TEST SUPERATI.');
