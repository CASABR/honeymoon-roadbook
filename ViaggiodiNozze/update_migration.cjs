const fs = require('fs');
let code = fs.readFileSync('src/views/altro/migrationData.ts', 'utf8');

const importStatement = "import { initialTransports } from '../../storage/seedTransports';\n";
if (!code.includes('initialTransports')) {
  code = importStatement + code;
}

const targetTransportsRegex = /const targetTransports = \[[\\s\\S]*?\];\n\n  for \(const t of targetTransports\) \{\n[\\s\\S]*?\n  \}\n/m;

const replacement = `
  for (const t of initialTransports) {
    const existing: any = transports.find((tr: any) => 
      (tr.date === t.date) && 
      Boolean(t.carrier && (tr.carrier || '').toLowerCase().includes(String(t.carrier).split(' ')[0].toLowerCase()))
    );
    if (existing) {
      const updated = { ...existing, ...t, updatedAt: Date.now() };
      await storageService.saveTransport(updated as any);
    } else {
      await storageService.saveTransport({
        ...t,
        id: "trn_" + Date.now() + Math.random().toString(36).substring(2, 9),
        createdAt: Date.now(),
        updatedAt: Date.now()
      } as any);
    }
  }
`;

code = code.replace(targetTransportsRegex, replacement);

fs.writeFileSync('src/views/altro/migrationData.ts', code, 'utf8');
