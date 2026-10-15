const fs = require('fs');

function test(filename, key) {
  const content = fs.readFileSync('src/storage/' + filename, 'utf8');
  const regex = new RegExp(key + ':\\s*[`"\']([^`"\']+)[`"\']', 'g');
  const matches = [...content.matchAll(regex)].map(m => m[1]);
  console.log(filename, key, 'matches:', matches.length, 'sample:', matches.slice(0, 3));
}

test('seedTappe.ts', 'titolo');
test('seedAlloggi.ts', 'name');
test('seedRistoranti.ts', 'nome');
test('seedActivities.ts', 'title');
