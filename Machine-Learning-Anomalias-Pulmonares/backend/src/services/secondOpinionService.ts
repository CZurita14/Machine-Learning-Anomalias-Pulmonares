import { env } from '../config/env.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';

export async function getSecondOpinion(imagePathOrName: string): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'tu_clave_aqui') {
    throw new Error('La clave de API de OpenRouter no está configurada.');
  }

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
  });

  // Si imagePathOrName es un archivo guardado (ej. upload_123.jpg) en UPLOADS_DIR
  // o si es una ruta absoluta, intentamos leerlo.
  let fullPath = imagePathOrName;
  if (!path.isAbsolute(imagePathOrName)) {
    const normalizedPath = imagePathOrName.replace(/\\/g, '/');
    const filename = path.basename(normalizedPath);
    if (filename.startsWith('upload_')) {
      fullPath = path.join(process.cwd(), env.UPLOADS_DIR, filename);
    } else {
      fullPath = path.join(process.cwd(), 'samples', filename);
    }
  }

  const buffer = await readFile(fullPath);
  const base64Image = buffer.toString('base64');
  
  const prompt = `Actúa como un radiólogo experto. Analiza la siguiente radiografía de tórax y proporciona una "Segunda Opinión Avanzada". 
Presta especial atención a la presencia de:
1. Cardiomegalia
2. Patrones intersticiales o Fibrosis
3. Nódulos o Masas pulmonares
4. Signos de Tuberculosis

El formato de salida debe ser un informe médico estructurado, conciso y profesional en formato Markdown.`;

  let retries = 3;
  let delay = 2000;

  while (retries > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ]
      });

      return completion.choices[0].message.content || 'Sin respuesta.';
    } catch (error: any) {
      console.error(`Error al llamar a OpenRouter (Intentos restantes: ${retries - 1}):`, error.message || error);
      
      if (error?.status === 503 && retries > 1) {
        retries--;
        console.log(`Reintentando en ${delay/1000} segundos...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
        continue;
      }
      throw new Error('Error al obtener la segunda opinión de la Inteligencia Artificial.');
    }
  }
  
  throw new Error('Error al obtener la segunda opinión tras múltiples intentos.');
}
