const webpush = require('web-push');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vapidKeys = webpush.generateVAPIDKeys();
const requestedPath = process.argv.find(value => value.startsWith('--out='))?.slice('--out='.length);
const outputPath = path.resolve(requestedPath || path.join(os.tmpdir(), `hounigo-vapid-${Date.now()}.json`));
fs.writeFileSync(outputPath, JSON.stringify(vapidKeys, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
console.log('Nuova chiave pubblica VAPID:', vapidKeys.publicKey);
console.log('Coppia privata salvata fuori dal repository:', outputPath);
console.log('La chiave privata non viene mostrata. Elimina il file solo dopo aver configurato il secret Wrangler.');
