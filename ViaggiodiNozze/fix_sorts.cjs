const fs = require('fs');

const files = [
  'src/views/OggiView.tsx',
  'src/views/TrasportiView.tsx',
  'src/views/AttivitaView.tsx',
  'src/views/altro/TappeView.tsx',
  'src/views/altro/SpeseBudgetView.tsx',
  'src/storage/storageService.ts'
];

function convertToISOString(varName) {
  return `((${varName} || '').split('-').length === 3 && (${varName} || '').split('-')[0].length === 2 ? (${varName} || '').split('-').reverse().join('-') : (${varName} || ''))`;
}

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    
    // In OggiView, fix timeline sort
    if (f.includes('OggiView')) {
      content = content.replace(
        /const sortedTimeline = \[\.\.\.timeline\]\.sort\(\(a, b\) => \{[\s\S]*?return timeA\.localeCompare\(timeB\);\s*\}\);/,
        `const sortedTimeline = [...timeline].sort((a, b) => {
            const dateA = a.originalData?.date || a.originalData?.data || a.originalData?.checkIn || '2026-11-28';
            const dateB = b.originalData?.date || b.originalData?.data || b.originalData?.checkIn || '2026-11-28';
            const isoA = ${convertToISOString('dateA')};
            const isoB = ${convertToISOString('dateB')};
            if (isoA !== isoB) return isoA.localeCompare(isoB);
            const timeA = a.time || '12:00';
            const timeB = b.time || '12:00';
            return timeA.localeCompare(timeB);
          });`
      );
    }

    // In TrasportiView, fix sortedDates
    if (f.includes('TrasportiView')) {
      content = content.replace(
        /const sortedDates = Object\.keys\(countryGroup\)\.sort\(\(a, b\) => a\.localeCompare\(b\)\);/,
        `const sortedDates = Object.keys(countryGroup).sort((a, b) => {
              const isoA = ${convertToISOString('a')};
              const isoB = ${convertToISOString('b')};
              return isoA.localeCompare(isoB);
            });`
      );
    }

    // In AttivitaView, fix date sort
    if (f.includes('AttivitaView')) {
      content = content.replace(
        /const sortedKeys = Object\.keys\(groups\)\.sort\(\);/,
        `const sortedKeys = Object.keys(groups).sort((a, b) => {
      const isoA = ${convertToISOString('a')};
      const isoB = ${convertToISOString('b')};
      return isoA.localeCompare(isoB);
    });`
      );
      content = content.replace(
        /return filtered\.sort\(\(a, b\) => \{[\s\S]*?if \(dateA !== dateB\) return dateA\.localeCompare\(dateB\);/,
        `return filtered.sort((a, b) => {
      const dateA = a.date || (a.dayId.startsWith('day_') ? a.dayId.replace('day_', '') : '');
      const dateB = b.date || (b.dayId.startsWith('day_') ? b.dayId.replace('day_', '') : '');
      const isoA = ${convertToISOString('dateA')};
      const isoB = ${convertToISOString('dateB')};
      if (isoA !== isoB) return isoA.localeCompare(isoB);`
      );
    }

    // In storageService, replace localeCompare sorts
    if (f.includes('storageService.ts')) {
      content = content.replace(/a\.date\.localeCompare\(b\.date\)/g, `${convertToISOString('a.date')}.localeCompare(${convertToISOString('b.date')})`);
      content = content.replace(/b\.date\.localeCompare\(a\.date\)/g, `${convertToISOString('b.date')}.localeCompare(${convertToISOString('a.date')})`);
      content = content.replace(/a\.checkIn\.localeCompare\(b\.checkIn\)/g, `${convertToISOString('a.checkIn')}.localeCompare(${convertToISOString('b.checkIn')})`);
      content = content.replace(/a\.data\.localeCompare\(b\.data\)/g, `${convertToISOString('a.data')}.localeCompare(${convertToISOString('b.data')})`);
    }

    fs.writeFileSync(f, content, 'utf8');
  }
});

// Now let's fix SpeseBudgetView to remove runDataMigration and debounce loadAllData
const sf = 'src/views/altro/SpeseBudgetView.tsx';
if (fs.existsSync(sf)) {
  let content = fs.readFileSync(sf, 'utf8');
  
  // Remove runDataMigration
  content = content.replace(/try\s*\{\s*await runDataMigration\(\);\s*\}\s*catch\s*\(e\)\s*\{\s*console\.error\(e\);\s*\}/, '');
  
  // Add debounce for useEffect
  content = content.replace(
    /useEffect\(\(\) => \{[\s\S]*?loadAllData\(\);[\s\S]*?const handleStorageChange = \(\) => loadAllData\(\);[\s\S]*?window\.addEventListener\("storage", handleStorageChange\);[\s\S]*?\}\, \[\]\);/,
    `useEffect(() => {
    loadAllData();
    let timeoutId: any;
    const handleStorageChange = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => loadAllData(), 250);
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("roadbook_data_mutated", handleStorageChange);
    window.addEventListener("roadbook_cloud_synced", handleStorageChange);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("roadbook_data_mutated", handleStorageChange);
      window.removeEventListener("roadbook_cloud_synced", handleStorageChange);
    };
  }, []);`
  );

  // Fix sort in addToList to convert DD-MM-YYYY to YYYY-MM-DD
  content = content.replace(
    /return new Date\(b\.date\)\.getTime\(\) - new Date\(a\.date\)\.getTime\(\);/,
    `const isoA = ${convertToISOString('a.date')};
      const isoB = ${convertToISOString('b.date')};
      return new Date(isoB).getTime() - new Date(isoA).getTime();`
  );

  fs.writeFileSync(sf, content, 'utf8');
}

console.log("Sort fixing done!");
