const https = require('https');

https.get('https://casabr.github.io/honeymoon-roadbook/', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const bundleMatch = body.match(/assets\/index-[^"]+\.js/);
    console.log('Live bundle detected:', bundleMatch ? bundleMatch[0] : 'None');
    if (bundleMatch) {
      https.get(`https://casabr.github.io/honeymoon-roadbook/${bundleMatch[0]}`, (bundleRes) => {
        let bBody = '';
        bundleRes.on('data', chunk => bBody += chunk);
        bundleRes.on('end', () => {
          console.log('Bundle contains 1.6.11:', bBody.includes('1.6.11'));
          console.log('Bundle contains overlapDetection:', bBody.includes('extractTimeInterval') || bBody.includes('collision_decision_'));
        });
      });
    }
  });
}).on('error', (e) => {
  console.error('Error fetching live site:', e);
});
