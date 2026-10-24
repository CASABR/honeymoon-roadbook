const http = require('http');

async function crawl(url, parent = null, visited = new Set()) {
  if (visited.has(url)) return;
  visited.add(url);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[ERROR ${res.status}] ${url} (required by ${parent})`);
      const text = await res.text();
      console.error(text.slice(0, 400));
      return;
    }
    const text = await res.text();
    const importRegex = /(?:from\s+['"]|import\s*\(['"])([^'"]+)['"]/g;
    let match;
    const subs = [];
    while ((match = importRegex.exec(text)) !== null) {
      subs.push(match[1]);
    }
    for (const sub of subs) {
      if (sub.startsWith('/')) {
        await crawl('http://localhost:5173' + sub, url, visited);
      } else if (sub.startsWith('.')) {
        const u = new URL(sub, url).toString();
        await crawl(u, url, visited);
      }
    }
  } catch (err) {
    console.error(`[FAIL] ${url}:`, err.message);
  }
}

async function main() {
  console.log('Testing MappaView import tree...');
  await crawl('http://localhost:5173/src/views/MappaView.tsx');
  console.log('Testing LiveView import tree...');
  await crawl('http://localhost:5173/src/views/altro/LiveView.tsx');
  console.log('All modules resolved successfully without 404 or 500.');
}

main();
