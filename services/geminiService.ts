
import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAi = () => {
  if (aiInstance) return aiInstance;
  
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY; console.warn( process.env.API_KEY);
  if (!key) {
    console.warn("Gemini API Key is missing. AI features will be disabled.");
    return null;
  }
  
  aiInstance = new GoogleGenAI({ apiKey: key });
  return aiInstance;
};

export const scanReceipt = async (base64Image: string) => {
  const ai = getAi();
  if (!ai) {
    throw new Error("AI features are not configured. Please set your Gemini API Key.");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Extract receipt information from this image. Return a JSON object with: amount (number), date (YYYY-MM-DD), description (string), and category (select from: 洗車, 美容, 租金, 水電, 薪金, 耗材, 營銷, 裝修, 其他). Use RMB values." },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            date: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING }
          },
          required: ["amount", "date", "description", "category"]
        }
      }
    });

    // response.text is a property, not a method.
    const text = response.text;
    return text ? JSON.parse(text) : null;
  } catch (error) {
    console.error("Gemini Scan Error:", error);
    return null;
  }
};
