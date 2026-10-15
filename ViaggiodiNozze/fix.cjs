const fs = require('fs');

// 1. ErrorBoundary.tsx
let eb = fs.readFileSync('src/components/ErrorBoundary.tsx', 'utf8');
eb = eb.replace(/console\.error\("CRASH ALL'AVVIO:", error, errorInfo\);/, 'console.error("FATAL ERROR STACK:", error);\n    console.error("COMPONENT STACK:", errorInfo.componentStack);');
fs.writeFileSync('src/components/ErrorBoundary.tsx', eb, 'utf8');

// 2. routingService.ts
let rs = fs.readFileSync('src/services/routingService.ts', 'utf8');
rs = rs.replace(/text\.toLowerCase\(\)/g, "String(text || '').toLowerCase()");
rs = rs.replace(/from\.trim\(\)\.toLowerCase\(\)/g, "String(from || '').trim().toLowerCase()");
rs = rs.replace(/to\.trim\(\)\.toLowerCase\(\)/g, "String(to || '').trim().toLowerCase()");
fs.writeFileSync('src/services/routingService.ts', rs, 'utf8');

// 3. mapsHelper.ts
let mh = fs.readFileSync('src/utils/mapsHelper.ts', 'utf8');
mh = mh.replace(/departureLocation\.toLowerCase\(\)/g, "(departureLocation || '').toLowerCase()");
mh = mh.replace(/arrivalLocation\.toLowerCase\(\)/g, "(arrivalLocation || '').toLowerCase()");
mh = mh.replace(/dropoffQuery\.toLowerCase\(\)/g, "(dropoffQuery || '').toLowerCase()");
mh = mh.replace(/depQuery\.toLowerCase\(\)/g, "(depQuery || '').toLowerCase()");
mh = mh.replace(/arrQuery\.toLowerCase\(\)/g, "(arrQuery || '').toLowerCase()");
mh = mh.replace(/raw\.toLowerCase\(\)/g, "String(raw || '').toLowerCase()");
fs.writeFileSync('src/utils/mapsHelper.ts', mh, 'utf8');

// 4. RouteBadge.tsx
let rb = fs.readFileSync('src/components/common/RouteBadge.tsx', 'utf8');
rb = rb.replace(/route\.formattedDistance\.toLowerCase\(\)/g, "(route?.formattedDistance || '').toLowerCase()");
rb = rb.replace(/from\.trim\(\)\.toLowerCase\(\)/g, "String(from || '').trim().toLowerCase()");
rb = rb.replace(/to\.trim\(\)\.toLowerCase\(\)/g, "String(to || '').trim().toLowerCase()");
fs.writeFileSync('src/components/common/RouteBadge.tsx', rb, 'utf8');
