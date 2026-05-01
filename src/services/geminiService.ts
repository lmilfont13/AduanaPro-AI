import { GoogleGenerativeAI } from "@google/generative-ai";
import { DocumentData, ComparisonResult, FreightData, FreightComparison } from "../types";

const getGeminiKey = () => {
  return (typeof localStorage !== 'undefined' ? localStorage.getItem('GEMINI_API_KEY') : "") ||
         import.meta.env.VITE_GEMINI_API_KEY || 
         "";
};

const genAI = new GoogleGenerativeAI(getGeminiKey());

async function getRobustModel() {
  const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];
  const modelName = models[0];
  return genAI.getGenerativeModel({ model: modelName });
}

export const parseDocument = async (base64Data: string, mimeType: string, pdfText?: string): Promise<DocumentData> => {
  const model = await getRobustModel();
  const prompt = `Analise este documento e extraia dados em JSON: { "documentType": "BL" | "CI" | "PL", "blNumber": "string", "weight": number, "cbm": number, "packages": number, "itemQuantity": number, "description": "string" }`;
  const result = await model.generateContent([prompt, { inlineData: { data: base64Data.split(',')[1] || base64Data, mimeType } }]);
  const response = await result.response;
  return JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
};

export const compareDocuments = async (bl: DocumentData, ci: DocumentData, pl: DocumentData): Promise<ComparisonResult> => {
  const model = await getRobustModel();
  const prompt = `Compare estes 3 docs: BL: ${JSON.stringify(bl)}, CI: ${JSON.stringify(ci)}, PL: ${JSON.stringify(pl)}. Retorne JSON: { "matches": boolean, "differences": [{ "field": "string", "message": "string", "status": "mismatch" }] }`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
};

export const parseFreightDocument = async (base64Data: string, mimeType: string): Promise<FreightData> => {
  const model = await getRobustModel();
  const prompt = `Extraia dados de frete em JSON: { "documentType": "QUOTE" | "INVOICE", "items": [{ "name": "string", "value": number, "currency": "USD" | "BRL" }], "exchangeRate": number }`;
  const result = await model.generateContent([prompt, { inlineData: { data: base64Data.split(',')[1] || base64Data, mimeType } }]);
  const response = await result.response;
  return JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
};

export const compareFreightDocuments = async (quote: FreightData, invoice: FreightData): Promise<FreightComparison> => {
  const model = await getRobustModel();
  const prompt = `Compare Fretes: Cotação: ${JSON.stringify(quote)}, Fatura: ${JSON.stringify(invoice)}. Retorne JSON: { "matches": boolean, "differences": [{ "itemName": "string", "quoteValue": number, "invoiceValue": number, "currency": "string", "status": "match" | "mismatch" }] }`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
};

export const compareFreightQuotes = async (quotes: any[]): Promise<{ summary: string }> => {
  const model = await getRobustModel();
  const prompt = `Analise e compare estas propostas de frete: ${JSON.stringify(quotes)}. Identifique a melhor opção baseada em custo-benefício e tempo. Retorne JSON: { "summary": "texto do resumo" }`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  try {
     const json = JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
     return { summary: json.summary || json.text || response.text() };
  } catch (e) {
     return { summary: response.text() };
  }
};

export const chatWithSpecialist = async (message: string, history: any[]): Promise<string> => {
  const model = await getRobustModel();
  const result = await model.generateContent(`Você é um especialista em comércio exterior brasileiro. Responda: ${message}`);
  const response = await result.response;
  return response.text();
};

export const generateSupplierQuestionnaire = async (spec: string): Promise<{ english: string, portuguese: string, tsv: string }> => {
  const model = await getRobustModel();
  const prompt = `Você é um Auditor Sênior de Qualidade e Engenharia. 
  Sua tarefa é criar um questionário técnico rigoroso para homologação de fornecedores internacionais, focado em EVITAR DOWNGRADE de componentes.
  
  Baseado nestas especificações: ${spec}
  
  Gere um questionário que questione especificamente cada ponto crítico (materiais, motor, certificações).
  
  Retorne EXATAMENTE este JSON: 
  { 
    "english": "technical questionnaire text in english", 
    "portuguese": "texto do questionário em português", 
    "tsv": "Pergunta\\tResposta_Esperada" 
  }`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
};

export const generateLIDraft = async (bl?: any, ci?: any, pl?: any): Promise<string> => {
  const model = await getRobustModel();
  const prompt = `Você é um Despachante Aduaneiro Senior. Sua tarefa é gerar um rascunho de Licença de Importação (LI) que replique FIELMENTE a estrutura oficial do Siscomex, baseando-se nos dados: 
  BL: ${JSON.stringify(bl)}
  CI: ${JSON.stringify(ci)}
  PL: ${JSON.stringify(pl)}
  
  O rascunho DEVE ser organizado nestas seções EXATAS:
  
  1. INFORMAÇÕES DA LI: (Licenciamento, Data/Hora Registro, Situação: EM ELABORAÇÃO)
  2. BÁSICAS: (Dados do Importador: Razão Social, CNPJ, Endereço Completo, CEP, Telefone)
  3. OUTRAS INFORMAÇÕES: (País de Procedência, URF de Despacho, URF de Entrada)
  4. NEGOCIAÇÃO: (Regime de Tributação, Cobertura Cambial, Modalidade de Pagamento)
  5. DETALHES DA MERCADORIA: (Lista de produtos: Unidade Comercializada, Peso Líquido, Qtde, Valor Unitário, Valor Total e ESPECIFICAÇÃO DETALHADA)
  6. TOTALIZADORES: (Peso Líquido Total, Valor Total)
  7. INFORMAÇÕES COMPLEMENTARES: (Ref. Containers, Fatura Comercial, Packing List)
  
  Retorne EXATAMENTE este JSON: { "draft": "texto do rascunho formatado" }`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  try {
    const json = JSON.parse(response.text().replace(/```json/g, "").replace(/```/g, ""));
    return json.draft || response.text();
  } catch (e) {
    return response.text();
  }
};
export const parseLogisticsData = async (base64Data: string, mimeType: string): Promise<any> => {
  const model = await getRobustModel();
  const prompt = `Analise este documento logístico e extraia os seguintes dados em JSON:
  {
    "supplierName": "nome do exportador",
    "contractTotal": 0.0,
    "ciNumber": "número da fatura",
    "containerNumber": "ABCD1234567",
    "bankDetails": "dados bancários completos (Beneficiary, SWIFT, Account)",
    "milestones": [{ "description": "...", "percentage": 0, "amount": 0, "date": "YYYY-MM-DD", "isPaid": false }]
  }`;
  const result = await model.generateContent([{ inlineData: { data: base64Data, mimeType } }, { text: prompt }]);
  return JSON.parse(result.response.text().replace(/```json/g, "").replace(/```/g, ""));
};

export const generateFreightRequest = async (logisticsData: any): Promise<string> => {
  const model = await getRobustModel();
  const prompt = `Gere um texto profissional para solicitação de cotação de frete internacional (Booking Request) baseado nos dados: ${JSON.stringify(logisticsData)}. O texto deve ser em Português, direto e conter todos os detalhes técnicos para o agente de carga.`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
};
