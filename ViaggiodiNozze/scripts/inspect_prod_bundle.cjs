async function checkProd() {
  const jsUrl = 'https://casabr.github.io/honeymoon-roadbook/assets/index-BHu27-o9.js';
  console.log('Fetching:', jsUrl);
  const jsRes = await fetch(jsUrl);
  const jsText = await jsRes.text();
  console.log('JS length:', jsText.length);
  console.log('Has joinTrip?', jsText.includes('joinTrip'));
  console.log('Has invites collection?', jsText.includes('"invites"'));

  let idx = 0;
  let count = 0;
  while ((idx = jsText.indexOf('invites', idx)) !== -1 && count < 5) {
    console.log('--- invites snippet at', idx, '---');
    console.log(jsText.substring(Math.max(0, idx - 80), Math.min(jsText.length, idx + 120)));
    idx += 7;
    count++;
  }

  let jtIdx = 0;
  let jtCount = 0;
  while ((jtIdx = jsText.indexOf('joinTrip', jtIdx)) !== -1 && jtCount < 5) {
    console.log('--- joinTrip snippet at', jtIdx, '---');
    console.log(jsText.substring(Math.max(0, jtIdx - 80), Math.min(jsText.length, jtIdx + 120)));
    jtIdx += 8;
    jtCount++;
  }
}

checkProd().catch(console.error);
