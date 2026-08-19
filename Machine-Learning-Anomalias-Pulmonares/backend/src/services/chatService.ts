import { env } from '../config/env.js';
import OpenAI from 'openai';

// Definir el tipo para los mensajes de chat
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function processChat(messages: ChatMessage[]): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'tu_clave_aqui') {
    throw new Error('La clave de API de OpenRouter no está configurada.');
  }

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
  });

  const systemPrompt: ChatMessage = {
    role: 'system',
    content: `Eres MedAI, un asistente médico experto especializado en radiología, enfermedades pulmonares y diagnóstico clínico. 
Tu función principal es ayudar al médico o usuario con temas estrictamente relacionados a tu campo: medicina, radiografías, pulmones, enfermedades, protocolos clínicos, etc.

REGLAS ESTRICTAS:
1. SI el usuario te hace una pregunta que NO está relacionada con medicina, salud, anatomía, software médico, o análisis de radiografías, DEBES negarte educadamente a responder diciendo que eres un asistente médico y solo puedes hablar sobre esos temas.
2. Mantén un tono profesional, empático y orientado a la clínica.
3. No des diagnósticos definitivos al paciente si no eres el médico, pero sugiere las interpretaciones más probables basadas en datos clínicos.`
  };

  // Prepend the system prompt to the user messages
  const fullMessages = [systemPrompt, ...messages];

  let retries = 3;
  let delay = 2000;

  while (retries > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1000,
        messages: fullMessages as any, // Cast as any because OpenRouter roles might slightly differ in TS typings
      });

      return completion.choices[0].message.content || 'Sin respuesta.';
    } catch (error: any) {
      console.error(`Error en chatService (Intentos restantes: ${retries - 1}):`, error.message || error);
      
      if (error?.status === 503 && retries > 1) {
        retries--;
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
        continue;
      }
      throw new Error('Error al obtener la respuesta de la Inteligencia Artificial.');
    }
  }
  
  throw new Error('Error al obtener la respuesta tras múltiples intentos.');
}
