const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// I need to add `{` before `filteredSpese.map((s) => {` if it's missing!
code = code.replace(/          filteredSpese\.map\(\(s\) => \{/g, '          {filteredSpese.map((s) => {');

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Fixed missing open brace');
