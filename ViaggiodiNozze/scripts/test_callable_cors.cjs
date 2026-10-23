async function testCallableHttp() {
  console.log('=== TEST CHIAMATA HTTP ALLA CALLABLE COME UN BROWSER (CON ORIGIN) ===');
  
  // Endpoint URL for callable joinTrip in us-central1 for project app-viaggio-di-nozze
  const url = 'https://us-central1-app-viaggio-di-nozze.cloudfunctions.net/joinTrip';
  
  console.log('Target URL:', url);
  
  // 1. Preflight OPTIONS request
  console.log('\n--- 1. Preflight OPTIONS ---');
  try {
    const preflightRes = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://casabr.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    console.log('Preflight status:', preflightRes.status);
    console.log('Preflight headers:', Object.fromEntries(preflightRes.headers.entries()));
  } catch (err) {
    console.error('Preflight error:', err.message);
  }

  // 2. POST request
  console.log('\n--- 2. POST request ---');
  try {
    const postRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Origin': 'https://casabr.github.io',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: { inviteToken: 'ULRDLU' }
      })
    });
    console.log('POST status:', postRes.status);
    console.log('POST headers:', Object.fromEntries(postRes.headers.entries()));
    const text = await postRes.text();
    console.log('POST response body:', text);
  } catch (err) {
    console.error('POST error:', err.message);
  }
}

testCallableHttp().catch(console.error);
