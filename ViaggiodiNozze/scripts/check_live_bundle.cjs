async function check() {
  const url = 'https://casabr.github.io/honeymoon-roadbook/?ts=' + Date.now();
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache, no-store' } });
  const html = await res.text();
  console.log('Live HTML response length:', html.length);
  const regex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    console.log('Found script tag:', match[1]);
  }
}
check().catch(console.error);
