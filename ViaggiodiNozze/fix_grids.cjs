const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/forms/**/*.tsx');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let replaced = false;

  // Find all instances of className="grid grid-cols-2 gap-3" and change to grid-cols-1 sm:grid-cols-2
  const newContent = content.replace(/className="grid grid-cols-2 gap-3"/g, 'className="grid grid-cols-1 sm:grid-cols-2 gap-3"');

  if (content !== newContent) {
    fs.writeFileSync(f, newContent);
    console.log('Fixed', f);
  }
});
