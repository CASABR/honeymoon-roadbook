const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// 1. Fix the brace
code = code.replace(/\)\r?\n\s*\}\)\}\r?\n\s*<\/>\r?\n\s*\)\}/, ')\n          })}\n          </>\n        )}');

// Wait! If it's currently:
// 994:             );
// 995:           })}
// 996:           </>
// 997:         )}
// It means the map ends with `          })}` (which is wrong, it should be `})`).
// Let's replace `          })}\r?\n          </>\r?\n        )}`
// with `          })\n          </>\n        )}`
code = code.replace(/[ \t]*\}\)\}\r?\n[ \t]*<\/>\r?\n[ \t]*\)\}/g, '          })\n          </>\n        )}');

// 2. Fix the export at the end (remove all literal \n and real export, and add real export)
code = code.replace(/\\n\\nexport default SpeseBudgetView;\\n/g, '');
code = code.replace(/export default SpeseBudgetView;/g, '');
code = code.trim();
code += '\n\nexport default SpeseBudgetView;\n';

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Fixed brace and export');
