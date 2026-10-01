const fs = require('fs');

let f = 'src/components/forms/TrasportoForm.tsx';
let content = fs.readFileSync(f, 'utf8');

// Replace grid-cols-3 with grid-cols-1 sm:grid-cols-3
const newContent = content.replace(/className="grid grid-cols-3 gap-3"/g, 'className="grid grid-cols-1 sm:grid-cols-3 gap-3"');

if (content !== newContent) {
  fs.writeFileSync(f, newContent);
  console.log('Fixed grid-cols-3 in', f);
}
