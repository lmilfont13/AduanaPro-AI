import { Groq } from 'groq-sdk';
import Tesseract from 'tesseract.js';
import { toast } from 'sonner';
import { DocumentData, ComparisonResult, FreightData, FreightComparison, PaymentMilestone } from "../types";

const getGroqKey = () => {
  return (typeof localStorage !== 'undefined' ? localStorage.getItem('GROQ_API_KEY') : "") || 
         import.meta.env.VITE_GROQ_API_KEY || 
         "";
};

const getGroqClient = () => {
  const apiKey = getGroqKey();
  if (!apiKey) return null;
  
  return new Groq({
    apiKey,
    dangerouslyAllowBrowser: true
  });
};

const MODELS_TO_TRY = [
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile"
];

const getGroqModel = () => {
  return (typeof localStorage !== 'undefined' ? localStorage.getItem('GROQ_MODEL') : "") || "llama-3.2-90b-vision-preview";
};

const cleanJsonString = (str: string): string => {
  try {
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    return str.replace(/```json|```/g, "").trim();
  } catch (e) {
    return str.replace(/```json|```/g, "").trim();
  }
};

const callAI = async (prompt: string, base64Image?: string, pdfText?: string): Promise<any> => {
  const groq = getGroqClient();
  if (!groq) throw new Error("Chave de API do Groq não encontrada.");

  const initialModel = getGroqModel();
  let models = [initialModel, ...MODELS_TO_TRY.filter(m => m !== initialModel)];

  if (base64Image && !pdfText) {
    const visionModels = models.filter(m => m.includes('vision'));
    const otherModels = models.filter(m => !m.includes('vision'));
    models = [...visionModels, ...otherModels];
  }

  let finalPrompt = prompt;
  
  // Se o texto do PDF for muito curto ou inexistente, pode ser um PDF escaneado (imagem)
  const isPdfTextEmpty = !pdfText || pdfText.trim().length < 50;

  if (isPdfTextEmpty && base64Image) {
    const isActuallyBase64 = base64Image.length > 100 && !base64Image.includes(" ");
    if (isActuallyBase64) {
      try {
        const sanitizedBase64 = base64Image.trim().replace(/\s/g, '');
        const formattedImage = sanitizedBase64.startsWith('data:') ? sanitizedBase64 : `data:image/jpeg;base64,${sanitizedBase64}`;
        const ocrResult = await Tesseract.recognize(formattedImage, 'por+eng');
        finalPrompt = `TEXTO DO DOCUMENTO (EXTRAÍDO VIA OCR):\n${ocrResult.data.text}\n\nSOLICITAÇÃO:\n${prompt}`;
      } catch (e) {
        console.warn("OCR falhou");
        finalPrompt = `SOLICITAÇÃO:\n${prompt}\n\n(O documento parece ser uma imagem mas o OCR falhou)`;
      }
    } else {
      finalPrompt = `TEXTO DO DOCUMENTO:\n${base64Image}\n\nSOLICITAÇÃO:\n${prompt}`;
    }
  } else if (pdfText) {
    finalPrompt = `TEXTO DO DOCUMENTO:\n${pdfText}\n\nSOLICITAÇÃO:\n${prompt}`;
  }

  let lastError = null;
  for (const modelName of models) {
    try {
      const isVisionModel = modelName.includes('vision');
      const messages: any[] = [
        { role: "system", content: "Você é um assistente de logística portuária técnico. Responda APENAS em JSON. NÃO INVENTE DADOS. Se não encontrar, use 'N/I'." }
      ];

      if (isVisionModel && base64Image) {
        const sanitizedBase64 = base64Image.trim().replace(/\s/g, '');
        const formattedImage = sanitizedBase64.startsWith('data:') ? sanitizedBase64 : `data:image/jpeg;base64,${sanitizedBase64}`;
        messages.push({
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: formattedImage } }
          ]
        });
      } else {
        messages.push({ role: "user", content: finalPrompt });
      }

      const completion = await groq.chat.completions.create({
        messages,
        model: modelName,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content || "";
      console.log(`IA Response (${modelName}):`, content);

      if (!content || content.length < 2) {
        console.warn(`Resposta vazia do modelo ${modelName}`);
        continue;
      }

      const lowerContent = content.toLowerCase();
      if (lowerContent.includes("desculpe") || lowerContent.includes("não posso") || (lowerContent.includes("sorry") && !lowerContent.includes("{"))) {
        console.warn(`Modelo ${modelName} recusou a tarefa`);
        continue;
      }

      try {
        const cleaned = cleanJsonString(content);
        const result = JSON.parse(cleaned);
        if (typeof localStorage !== 'undefined') localStorage.setItem('GROQ_MODEL', modelName);
        return result;
      } catch (parseErr) {
        console.error(`Erro ao parsear JSON do modelo ${modelName}:`, parseErr);
        continue;
      }
    } catch (error: any) {
      console.error(`Erro no modelo ${modelName}:`, error);
      lastError = error;
      const isRateLimit = error.status === 429;
      if (isRateLimit) continue;
      throw error;
    }
  }
  
  if (lastError) {
    toast.error(`Falha na IA: ${lastError.message || "Erro desconhecido"}`);
  }
  throw lastError;
};

export const parseDocumentWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<DocumentData> => {
  const prompt = `Extraia dados do documento. JSON: { "type": "string", "number": "string", "weight": number, "cbm": number, "packages": number }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parseCIWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise Commercial Invoice. JSON: { "po": "string", "supplier": "string", "totalValue": number, "currency": "string", "totalQuantity": number }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parsePLWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise Packing List. JSON: { "totalPackages": number, "totalQuantity": number, "totalCbm": number }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parsePLFromTextWithGroq = async (text: string): Promise<any> => {
  return await parsePLWithGroq("", "", text);
};

export const parseFreightDocumentWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<FreightData> => {
  const prompt = `Analyze Freight document. Return JSON.`;
  const json = await callAI(prompt, base64Data, pdfText);
  const rate = json.exchangeRate || 5.15;
  const items = (json.items || []).map((i: any) => ({ ...i, value: parseFloat(i.value) || 0 }));
  const originalUSD = items.reduce((acc: number, i: any) => i.currency === "USD" ? acc + i.value : acc, 0);
  const originalBRL = items.reduce((acc: number, i: any) => i.currency === "BRL" ? acc + i.value : acc, 0);
  return {
    ...json,
    items,
    exchangeRate: rate,
    originalUSD,
    originalBRL,
    totalUSD: originalUSD + (originalBRL / rate),
    totalBRL: originalBRL + (originalUSD * rate)
  };
};

export const generateSupplierQuestionnaireWithGroq = async (productSpec: string): Promise<any> => {
  const prompt = `Auditoria técnica: ${productSpec}. JSON: { "portuguese": "string", "english": "string", "tsv": "string" }`;
  return await callAI(prompt);
};

export const compareFreightQuotesWithGroq = async (quotes: any[]): Promise<{ summary: string }> => {
  const prompt = `Compare quotes: ${JSON.stringify(quotes)}.`;
  const resp = await callAI(prompt);
  return { summary: resp.summary || JSON.stringify(resp) };
};

export const parsePaymentReceiptWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Você é um Auditor Financeiro de Comércio Exterior de Elite. Sua missão é extrair dados com 100% de precisão.
  
  ⚠️ REGRAS CRÍTICAS:
  - Identifique o TIPO de documento (Invoice, Proforma, SWIFT/Comprovante, Bank Advice).
  - Extraia o Supplier (Vendedor) e Beneficiary (se for SWIFT).
  - Se for um COMPROVANTE BANCÁRIO/SWIFT: Extraia o valor liquidado, a taxa de câmbio (Exchange Rate) e a data do envio.
  - Se for uma INVOICE: Extraia o total, número da CI/PI, termos de pagamento (ex: 30/70) e dados bancários (IBAN/SWIFT).
  - Procure por marcos de pagamento (milestones) mencionados no corpo do texto.

  Retorne OBRIGATORIAMENTE este JSON:
  {
    "documentType": "INVOICE" | "SWIFT" | "OTHER",
    "supplierName": "string",
    "ciNumber": "string",
    "contractTotal": number,
    "currency": "USD" | "EUR" | "BRL",
    "bankDetails": "string (IBAN, SWIFT, Bank Name)",
    "exchangeRate": number (se houver no documento),
    "paymentDate": "YYYY-MM-DD",
    "milestones": [
      { "description": "string", "percentage": number, "amount": number, "date": "YYYY-MM-DD" }
    ],
    "items": [
      { "description": "string", "quantity": number, "unitPrice": number, "total": number }
    ]
  }

  Se não encontrar um dado, use "N/I". Responda APENAS o JSON.`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parseMilestonesWithGroq = async (input: string | { base64: string, mimeType: string }): Promise<any> => {
  const prompt = `Extraia milestones. JSON: { "milestones": [] }`;
  if (typeof input === 'string') return await callAI(prompt, undefined, input);
  return await callAI(prompt, input.base64, "");
};

export const compareDocumentsWithGroq = async (bl: any, ci: any, pl: any): Promise<any> => {
  const prompt = `Compare BL, CI, PL. JSON: { "discrepancies": [] }`;
  return await callAI(prompt);
};

export const consolidateDocumentsWithGroq = async (docs: any[]): Promise<any> => {
  const prompt = `Consolidate: ${JSON.stringify(docs)}.`;
  return await callAI(prompt);
};

export const generateLIDraftWithGroq = async (bl?: any, ci?: any, pl?: any): Promise<string> => {
  const prompt = `Gerar rascunho LI Siscomex. JSON: { "draft": "string" }`;
  const resp = await callAI(prompt);
  return resp.draft || JSON.stringify(resp, null, 2);
};

export const chatWithSpecialistWithGroq = async (messages: any[]): Promise<string> => {
  const lastMsg = messages[messages.length - 1].content;
  const resp = await callAI(lastMsg);
  return resp.response || resp.content || JSON.stringify(resp);
};

export const listAvailableModels = async (): Promise<string[]> => {
  const apiKey = getGroqKey();
  if (!apiKey) return ["llama-3.3-70b-versatile"];
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const data = await response.json();
    return data.data?.map((m: any) => m.id) || ["llama-3.3-70b-versatile"];
  } catch {
    return ["llama-3.3-70b-versatile"];
  }
};

export const parseLogisticsDataWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise este documento de logística (Packing List/Invoice) e extraia dados REAIS.
  
  ⚠️ AVISO CRÍTICO DE SEGURANÇA:
  - NÃO INVENTE DADOS.
  - NÃO USE "CTN12345", "PO12345", "São Paulo", "Rio de Janeiro", "12345.67".
  - Se você não encontrar a informação exata no documento, retorne OBRIGATORIAMENTE "N/I".
  - PESQUISE MINUCIOSAMENTE por "Gross Weight", "GW", "GWK", "Total Weight", "CBM", "Measurement", "Cartons", "Packages", "Total Pcs".

  Campos a extrair:
  1. operation (CTN)
  2. po (Purchase Order)
  3. origin (Origem)
  4. destination (Destino)
  5. route (Rota)
  6. equipment (Containers)
  7. freeTime
  8. transitTime
  9. incoterm
  10. totalValue (Valor total da mercadoria)
  11. weight (Peso Bruto Total)
  12. commodity (Produto/Descrição)
  13. hasBattery (Sim/Não)
  14. certifications (INMETRO/ANVISA)

  Responda APENAS o JSON.`;

  try {
    const result = await callAI(prompt, base64Data, pdfText);
    return result;
  } catch (e) {
    toast.error("Erro na extração da IA.");
    return {};
  }
};

export const generateFreightRequestWithGroq = async (logisticsData: any): Promise<string> => {
  const template = `• OPERAÇÃO: ${logisticsData.operation || 'N/I'}
• PO: ${logisticsData.po || 'N/I'}
• Origem: ${logisticsData.origin || 'N/I'}
• Destino: ${logisticsData.destination || 'N/I'}
• Rota: ${logisticsData.route || 'Direta'}
• Equipamento: ${logisticsData.equipment || 'N/I'}
• Free time: ${logisticsData.freeTime || 'mínimo de 21 dias'}
• Transit time: ${logisticsData.transitTime || 'mais rápido'}
• Tipo de Frete: ${logisticsData.incoterm || 'FOB'}
• Custo Mercadoria: ${logisticsData.totalValue || 'N/I'}
• Cotar o seguro (Seguro deve ser feito)
• Peso Bruto: ${logisticsData.weight || 'N/I'}
• Produto: ${logisticsData.commodity || 'N/I'}
• ${logisticsData.hasBattery?.toLowerCase().includes('sim') ? 'Possui Bateria Interna' : 'Não Possui Bateria Interna'}
• Certificação ${logisticsData.certifications || 'INMETRO e ANVISA'}`;

  return template;
};

export const compareFreightDocumentsWithGroq = async (quote: FreightData, invoice: FreightData): Promise<FreightComparison> => {
  const prompt = `Compare: ${JSON.stringify(quote)}, ${JSON.stringify(invoice)}.`;
  return await callAI(prompt);
};

export const parseArrivalScheduleWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise cronograma de chegada. JSON: { "items": [] }`;
  return await callAI(prompt, base64Data, pdfText);
};
