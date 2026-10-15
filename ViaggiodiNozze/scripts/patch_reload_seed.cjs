const fs = require('fs');

let content = fs.readFileSync('src/views/TrasportiView.tsx', 'utf8');

const targetStr = `  const handleReloadSeedData = async () => {
    if (confirm('Vuoi ripristinare le tratte certificate del viaggio con orari, scali e prezzi in €?')) {
      await storageService.seedTransports(true);
      await loadData();
    }
  };`;

const replacementStr = `  const handleReloadSeedData = async () => {
    if (confirm('Vuoi ELIMINARE tutti i trasporti attuali e RIPRISTINARE le tratte certificate del viaggio con orari, scali e prezzi in €? Questa azione azzererà l\\'archivio sporco in un solo click!')) {
      const allT = await storageService.getTransports();
      for (const t of allT) {
        await storageService.deleteTransport(t.id);
      }
      await storageService.seedTransports(true);
      await loadData();
    }
  };`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/views/TrasportiView.tsx', content, 'utf8');
    console.log('TrasportiView successfully patched for clearTransports!');
} else {
    const regex = /  const handleReloadSeedData = async \(\) => \{\s*if \(confirm\('Vuoi ripristinare le tratte certificate del viaggio con orari, scali e prezzi in .?'\)\) \{\s*await storageService\.seedTransports\(true\);\s*await loadData\(\);\s*\}\s*\};/u;
    if (regex.test(content)) {
        content = content.replace(regex, replacementStr);
        fs.writeFileSync('src/views/TrasportiView.tsx', content, 'utf8');
        console.log('TrasportiView successfully patched via regex!');
    } else {
        console.log('Regex did not match in TrasportiView.tsx');
    }
}
