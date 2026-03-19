import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the provided document and extract information for certificates and invoices.
    
    For Certificates (الشهادات), extract:
    - CCR No (رقم الشهادة)
    - Date of Approval (تاريخ الاعتماد)
    - Date of Expiry (تاريخ الانتهاء)
    - Issue Date (تاريخ الإصدار)
    - Terms or Conditions (الشروط أو الأحكام)
    - Type (النوع)
    - Page Number (رقم الصفحة)
    
    For Invoices (الفاتورة), extract:
    - Specification or description (الوصف أو المواصفات)
    - Quantity (الكمية)
    
    Return the data in the following JSON format:
    {
      "fullText": "string (the complete extracted text from the document)",
      "certificates": [
        { "ccrNo": "string", "approvalDate": "string", "expiryDate": "string", "issueDate": "string", "terms": "string", "type": "string", "pageNumber": number }
      ],
      "invoices": [
        { "specification": "string", "quantity": number }
      ]
    }
    
    If multiple certificates or invoice items are found, list them all.
    Dates should be in YYYY-MM-DD format if possible.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data.split(",")[1] || base64Data,
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullText: { type: Type.STRING },
            certificates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ccrNo: { type: Type.STRING },
                  approvalDate: { type: Type.STRING },
                  expiryDate: { type: Type.STRING },
                  issueDate: { type: Type.STRING },
                  terms: { type: Type.STRING },
                  type: { type: Type.STRING },
                  pageNumber: { type: Type.NUMBER }
                },
                required: ["ccrNo", "expiryDate"]
              }
            },
            invoices: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  specification: { type: Type.STRING },
                  quantity: { type: Type.NUMBER }
                },
                required: ["specification", "quantity"]
              }
            }
          },
          required: ["certificates", "invoices", "fullText"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
};
