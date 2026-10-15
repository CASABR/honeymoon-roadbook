const fs = require('fs');

let content = fs.readFileSync('src/storage/seedAlloggi.ts', 'utf8');

// replace Omit<Alloggio, 'id' | 'updatedAt' | 'createdAt'> with Omit<Alloggio, 'updatedAt' | 'createdAt'>
content = content.replace("Omit<Alloggio, 'id' | 'updatedAt' | 'createdAt'>", "Omit<Alloggio, 'updatedAt' | 'createdAt'>");

// Add an id to each object, e.g. id: 'alloggio_01'
let count = 1;
content = content.replace(/{\n\s*name:/g, () => {
    const id = count.toString().padStart(2, '0');
    count++;
    return `{\n    id: 'alloggio_${id}',\n    name:`;
});

// Remove unused StatoAlloggio import
content = content.replace("import type { Alloggio, StatoAlloggio }", "import type { Alloggio }");

fs.writeFileSync('src/storage/seedAlloggi.ts', content, 'utf8');
console.log('Fixed seedAlloggi.ts ids and types!');
