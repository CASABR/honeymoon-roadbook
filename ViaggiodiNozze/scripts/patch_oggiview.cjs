const fs = require('fs');

let content = fs.readFileSync('src/views/OggiView.tsx', 'utf8');

const targetStr = `  const fetchTimeline = useCallback(async (dateToFetch?: string) => {
    const target = dateToFetch || selectedDate;
    const items = await storageService.getTimelineForDate(target);
    setTimeline(items);`;

const replacementStr = `  const fetchTimeline = useCallback(async (dateToFetch?: string) => {
    const target = dateToFetch || selectedDate;
    const items = await storageService.getTimelineForDate(target);
    
    // --- FILTRO RIGIDO DEDUPLICAZIONE ---
    const filteredItems = [];
    for (const item of items) {
      if (item.type === 'transport' && item.originalData) {
        const t = item.originalData as import('../types').Trasporto;
        
        // CANCELLAZIONE FISICA E SCARTO TRENO 28/11
        if (t.date === '2026-11-28' && t.type === 'treno') {
          if (t.carrier === 'TRENO ROMA TERMINI - MILANO CENTRALE' || t.departureTime === '00:00') {
             await storageService.deleteTransport(t.id);
             continue; // SCARTA
          }
        }
        
        // CANCELLAZIONE FISICA E SCARTO VOLO CUMULATIVO 29/11 - 01/12
        if (t.type === 'volo' && (t.date === '2026-11-29' || t.date === '2026-12-01')) {
          if (t.carrier && (t.carrier.includes('(CA950 + CA783)') || t.carrier.includes('CA950 + CA783'))) {
             await storageService.deleteTransport(t.id);
             continue; // SCARTA
          }
        }
      }
      filteredItems.push(item);
    }
    
    setTimeline(filteredItems);`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/views/OggiView.tsx', content, 'utf8');
    console.log('OggiView successfully patched with synchronous filter!');
} else {
    // Try with regex ignoring exact spacing
    const regex = /  const fetchTimeline = useCallback\(async \(dateToFetch\?: string\) => \{\s*const target = dateToFetch \|\| selectedDate;\s*const items = await storageService\.getTimelineForDate\(target\);\s*setTimeline\(items\);/;
    
    if (regex.test(content)) {
        content = content.replace(regex, replacementStr);
        fs.writeFileSync('src/views/OggiView.tsx', content, 'utf8');
        console.log('OggiView successfully patched using regex!');
    } else {
        console.log('Regex did not match in OggiView.tsx either.');
    }
}
