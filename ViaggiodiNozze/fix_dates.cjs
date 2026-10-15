const fs = require('fs');

function findAndReplaceDates() {
    const files = [
        'src/components/cards/TrasportoCard.tsx',
        'src/components/cards/AttivitaCard.tsx',
        'src/components/cards/AlloggioCard.tsx',
        'src/components/cards/RistoranteCard.tsx',
        'src/components/cards/ShoppingCard.tsx',
        'src/components/cards/TappaCard.tsx',
        'src/views/altro/SpeseBudgetView.tsx',
        'src/components/modals/TimelineItemDetailModal.tsx',
        'src/components/modals/TrasportoInfoModal.tsx'
    ];

    files.forEach(f => {
        if (!fs.existsSync(f)) return;
        let content = fs.readFileSync(f, 'utf8');
        let modified = false;

        const importStmt = "import { formatDate } from '../../utils/tripDates';\n";
        if (!content.includes('import { formatDate }')) {
            content = content.replace(/import \{ formatDate \} from '\.\.\/\.\.\/utils\/tripDates';\n/g, '');
            // find last import
            const lastImportIndex = content.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
                const endOfLastImport = content.indexOf('\n', lastImportIndex);
                content = content.substring(0, endOfLastImport + 1) + importStmt + content.substring(endOfLastImport + 1);
            } else {
                content = importStmt + content;
            }
            modified = true;
        }

        // Common patterns
        const replacePattern = (pattern, replacement) => {
            if (content.includes(pattern)) {
                content = content.split(pattern).join(replacement);
                modified = true;
            }
        };

        replacePattern('{item.date}', '{formatDate(item.date)}');
        replacePattern('{item.checkIn}', '{formatDate(item.checkIn)}');
        replacePattern('{item.checkOut}', '{formatDate(item.checkOut)}');
        replacePattern('{item.data}', '{formatDate(item.data)}');
        
        replacePattern('{trasporto.date}', '{formatDate(trasporto.date)}');
        replacePattern('{trasporto.dropoffDate}', '{formatDate(trasporto.dropoffDate)}');
        
        replacePattern('{attivita.date}', '{formatDate(attivita.date)}');
        
        replacePattern('{alloggio.checkIn}', '{formatDate(alloggio.checkIn)}');
        replacePattern('{alloggio.checkOut}', '{formatDate(alloggio.checkOut)}');
        
        replacePattern('{tappa.data}', '{formatDate(tappa.data)}');
        replacePattern('{tappa.date}', '{formatDate(tappa.date)}');
        
        replacePattern('{shopping.data}', '{formatDate(shopping.data)}');
        replacePattern('{shopping.date}', '{formatDate(shopping.date)}');
        
        replacePattern('{ristorante.data}', '{formatDate(ristorante.data)}');
        replacePattern('{ristorante.date}', '{formatDate(ristorante.date)}');

        replacePattern('{t.date}', '{formatDate(t.date)}');
        replacePattern('{t.dropoffDate}', '{formatDate(t.dropoffDate)}');

        if (modified) {
            fs.writeFileSync(f, content, 'utf8');
        }
    });
}
findAndReplaceDates();
