const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const matchB64 = env.match(/VITE_GEMINI_API_KEY_B64=(.+)/);
const matchPlain = env.match(/VITE_GEMINI_API_KEY=(.+)/);

const b64Val = matchB64 ? matchB64[1].trim().replace(/^['"]|['"]$/g, '') : '';
const plainVal = matchPlain ? matchPlain[1].trim().replace(/^['"]|['"]$/g, '') : '';

console.log('B64 Key configured in .env.local:', Boolean(b64Val), b64Val ? '(length: ' + b64Val.length + ')' : '');
console.log('Plain Key configured in .env.local:', Boolean(plainVal), plainVal ? '(length: ' + plainVal.length + ')' : '');

const distDir = path.join(__dirname, '..', 'dist', 'assets');
if (!fs.existsSync(distDir)) {
  console.log('dist/assets directory does not exist. Run npm run build first.');
  process.exit(0);
}

const distFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
let embedded = false;
for (const f of distFiles) {
  const content = fs.readFileSync(path.join(distDir, f), 'utf-8');
  if (b64Val && content.includes(b64Val)) {
    console.log('[ALERT] B64 string is directly embedded in bundle:', f);
    embedded = true;
  }
  if (plainVal && plainVal !== 'la_tua_chiave' && content.includes(plainVal)) {
    console.log('[ALERT] Plain text key is directly embedded in bundle:', f);
    embedded = true;
  }
  if (b64Val) {
    try {
      const decoded = Buffer.from(b64Val, 'base64').toString('utf-8');
      if (decoded.length > 10 && content.includes(decoded)) {
        console.log('[ALERT] Decoded key is directly embedded in bundle:', f);
        embedded = true;
      }
    } catch {}
  }
}

if (!embedded) {
  console.log('[OK] Neither raw B64 nor decoded Gemini key found embedded in static bundle.');
} else {
  console.log('[FINDING] The Gemini key is embedded in client-side production bundle.');
}
