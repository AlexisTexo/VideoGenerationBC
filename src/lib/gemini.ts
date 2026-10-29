export class AiError extends Error {
  constructor(
    message: string,
    readonly code: 'config' | 'request' | 'format',
  ) {
    super(message);
  }
}

const DEFAULT_MODEL = 'gemini-3.8-flash';

/** Pide a Gemini una respuesta JSON y la devuelve ya parseada. */
export async function generateJson(options: { system: string; prompt: string; temperature?: number }): Promise<unknown> {
  const key = import.meta.env.GEMINI_API_KEY;
  if (!key) throw new AiError('Falta GEMINI_API_KEY en .env', 'config');

  const model = import.meta.env.GEMINI_MODEL || DEFAULT_MODEL;
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
        generationConfig: { temperature: options.temperature ?? 0.9, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    console.error('Gemini no respondió:', error instanceof Error ? error.message : error);
    throw new AiError('Gemini no respondió a tiempo', 'request');
  }

  if (!response.ok) {
    console.error('Gemini error', response.status, (await response.text()).slice(0, 500));
    throw new AiError(`Gemini respondió ${response.status}`, 'request');
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new AiError('Gemini devolvió una respuesta vacía', 'format');

  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('Gemini no devolvió JSON válido', 'format');
  }
}
