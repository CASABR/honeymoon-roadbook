const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/forms/**/*.tsx');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let replaced = false;

  const newContent = content
    .replace(/<div className="grid grid-cols-2 gap-3">\s*<div>/g, '<div className="grid grid-cols-2 gap-3">\n              <div className="min-w-0">')
    .replace(/<\/div>\s*<div>\s*<label/g, '</div>\n              <div className="min-w-0">\n                <label');

  if (content !== newContent) {
    fs.writeFileSync(f, newContent);
    console.log('Fixed', f);
  }
});
