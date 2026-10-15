const fs = require('fs');

const path = 'src/services/aiExtractor.ts';
let content = fs.readFileSync(path, 'utf8');

const targetApiKey = `    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('la_tua_chiave')) return { ok: false, error: 'VITE_GEMINI_API_KEY mancante o non configurata nel file .env' };`;

const replacementApiKey = `    let apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('la_tua_chiave')) {
      apiKey = localStorage.getItem('gemini_api_key');
    }
    if (!apiKey || apiKey.includes('la_tua_chiave')) {
      apiKey = 'AQ.Ab8RN6Kxc93HHq3cDGA0Sv3XFgczoWKPiXUip9tgF88fixCHg';
    }
    if (!apiKey) return { ok: false, error: 'Chiave API Gemini mancante' };`;

content = content.replace(targetApiKey, replacementApiKey);

fs.writeFileSync(path, content, 'utf8');
console.log("Updated aiExtractor.ts");
