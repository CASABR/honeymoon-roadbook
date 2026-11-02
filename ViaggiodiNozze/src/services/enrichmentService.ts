import { callHouniAi } from './houniAiGateway';

const cache = new Map<string, { data: any, ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minuti

export async function enrichRistorante(nome: string, indirizzo: string): Promise<{ telefono?: string, linkMenu?: string }> {
  const cacheKey = `enrich_${nome}_${indirizzo}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const prompt = `Trova il numero di telefono pubblico (formato internazionale se possibile) e il link al sito web ufficiale (o al menu) del seguente ristorante. Rispondi ESCLUSIVAMENTE in formato JSON valido, usando questo schema:
  {
    "telefono": "stringa o null",
    "linkMenu": "stringa (URL) o null"
  }
  
  Ristorante: ${nome}
  Indirizzo o Località: ${indirizzo || 'sconosciuto'}
  
  Se non trovi dati certi, restituisci null per quei campi. NON includere markdown come \`\`\`json.`;

  try {
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: 'application/json'
      }
    };
    
    const response = await callHouniAi(requestBody);
    const text = response.ok ? response.text : '';
    
    if (text) {
      const parsed = JSON.parse(text);
      cache.set(cacheKey, { data: parsed, ts: Date.now() });
      return parsed;
    }
  } catch (e) {
    console.error("Enrichment fallito:", e);
  }
  return {};
}
