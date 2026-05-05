import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config({ path: '/app/applet/.env' });

async function run() {
  const ai = new GoogleGenAI({});
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "hi",
    });
    console.log("Success 2.5-flash!", res.text);
  } catch(e) {
    console.error("2.5-flash Error:", e.status, e.message);
  }
}
run();
