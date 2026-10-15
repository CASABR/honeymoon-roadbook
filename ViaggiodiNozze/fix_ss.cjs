const fs = require('fs');
let code = fs.readFileSync('src/storage/storageService.ts', 'utf8');
code = code.replace(/SEED_TRANSPORTS/g, 'initialTransports');
fs.writeFileSync('src/storage/storageService.ts', code, 'utf8');
