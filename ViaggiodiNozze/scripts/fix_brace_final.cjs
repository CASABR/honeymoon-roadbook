const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// The problematic lines:
// 994:             );
// 995:           })
// 996:           </>
// 997:         )}
// 998:       </div>

const lines = code.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('          })') && lines[i+1] && lines[i+1].includes('          </>')) {
    lines[i] = lines[i].replace('})', '})}');
  }
}

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', lines.join('\n'));
console.log('Fixed brace');
