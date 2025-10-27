import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

export async function callGemini(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    console.log("✅ Gemini fallback success");
    return response;
  } catch (error) {
    console.error("❌ Gemini fallback failed:", error);
    return null;
  }
}
