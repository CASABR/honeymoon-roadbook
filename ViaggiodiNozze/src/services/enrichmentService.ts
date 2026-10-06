export async function enrichRistorante(nome: string, indirizzo: string): Promise<{ telefono?: string, linkMenu?: string }> {
  const apiKeyB64 = import.meta.env.VITE_GEMINI_API_KEY_B64;
  const apiKey = apiKeyB64 && typeof window !== 'undefined' ? atob(apiKeyB64) : '';
  if (!apiKey) return {};

  const prompt = `Trova il numero di telefono pubblico (formato internazionale se possibile) e il link al sito web ufficiale (o al menu) del seguente ristorante. Rispondi ESCLUSIVAMENTE in formato JSON valido, usando questo schema:
  {
    "telefono": "stringa o null",
    "linkMenu": "stringa (URL) o null"
  }
  
  Ristorante: ${nome}
  Indirizzo o Località: ${indirizzo || 'sconosciuto'}
  
  Se non trovi dati certi, restituisci null per quei campi. NON includere markdown come \`\`\`json.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });
    
    if (!res.ok) return {};
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      return parsed;
    }
  } catch (e) {
    console.error("Enrichment fallito:", e);
  }
  return {};
}
