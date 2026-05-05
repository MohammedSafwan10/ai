import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const responseStream = ai.models.generateContentStream({
    model: "gemini-3.1-flash-lite-preview",
    contents: "Tell me a joke.",
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });
  
  for await (const chunk of await responseStream) {
    console.log("Chunk:");
    console.log(JSON.stringify(chunk.candidates?.[0]?.content?.parts, null, 2));
  }
}

run().catch(console.error);
