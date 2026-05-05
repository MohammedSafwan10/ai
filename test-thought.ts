import { GoogleGenAI, ThinkingLevel } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Explain the meaning of life in 2 sentences.",
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
  });
  console.log(JSON.stringify(response.candidates?.[0]?.content?.parts, null, 2));
}

run().catch(console.error);
