const fs = require('fs');
let code = fs.readFileSync('scripts/refactor_advanced_spese.cjs', 'utf8');
// The script exports a variable 'code' containing the actual file content! Wait, it sets a local 'code' variable.
// I will just execute the string inside refactor_advanced_spese.cjs
const fileContentMatches = code.match(/const code = `([\s\S]*?)`;\nfs\.writeFileSync/);
if (fileContentMatches) {
  fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', fileContentMatches[1], 'utf8');
} else {
  // alternative
  const justString = code.split('const code = `')[1].split('`;')[0];
  fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', justString, 'utf8');
}
console.log('Successfully wrote SpeseBudgetView.tsx');
