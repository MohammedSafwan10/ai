import { GoogleGenAI, ThinkingLevel } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({});
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.0-flash",
      contents: "hi",
    });
    console.log("Success 3.0-flash!", res.text);
  } catch(e: any) {
    console.error("3.0 Error:", e.status, e.message);
  }
}
run();
