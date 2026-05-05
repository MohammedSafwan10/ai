import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config({ path: '/.env' }); // or process.cwd() + '/.env'

async function run() {
  const ai = new GoogleGenAI({});
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "hi",
    });
    console.log("Success:", res.text);
  } catch(e: any) {
    console.error("Error:", e.status, e.message);
  }
}
run();
