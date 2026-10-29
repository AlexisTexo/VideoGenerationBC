// Prueba rápida de la clave y el modelo de Gemini: npm run check:gemini
const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

if (!key) {
  console.error('Falta GEMINI_API_KEY en .env. Créala en https://aistudio.google.com/apikey');
  process.exit(1);
}

const started = Date.now();
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Responde solo con este JSON: {"ok":true,"mensaje":"hola"}' }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 64 },
  }),
  signal: AbortSignal.timeout(30_000),
}).catch((error) => {
  console.error('No se pudo conectar con Gemini:', error.message);
  process.exit(1);
});

const hints = {
  400: 'Revisa el nombre del modelo en GEMINI_MODEL.',
  403: 'La clave no tiene permiso. Genera otra en https://aistudio.google.com/apikey',
  404: 'El modelo no existe. Revisa GEMINI_MODEL.',
  429: 'Se acabó la cuota. Espera un poco o activa facturación.',
};

if (!response.ok) {
  console.error(`Gemini respondió ${response.status}. ${hints[response.status] ?? ''}`);
  console.error((await response.text()).slice(0, 400));
  process.exit(1);
}

const data = await response.json();
const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
console.log(`Modelo: ${model}`);
console.log(`Tiempo: ${Date.now() - started} ms`);
console.log(`Tokens: ${data.usageMetadata?.promptTokenCount ?? '?'} de entrada, ${data.usageMetadata?.candidatesTokenCount ?? '?'} de salida`);
console.log(`Respuesta: ${text.trim()}`);
