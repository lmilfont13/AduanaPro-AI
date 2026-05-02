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
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant"
];

const getGroqModel = () => {
  const savedModel = (typeof localStorage !== 'undefined' ? localStorage.getItem('GROQ_MODEL') : "") || "llama-3.3-70b-versatile";
  const mappings: Record<string, string> = {
    "llama-3.1-70b-versatile": "llama-3.3-70b-versatile",
    "llama-3.1-405b-reasoning": "llama-3.3-70b-versatile",
    "llama-3.2-90b-vision-preview": "llama-3.3-70b-versatile",
    "llama-3.2-11b-vision-preview": "llama-3.3-70b-versatile"
  };
  return mappings[savedModel] || savedModel;
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
  const models = [initialModel, ...MODELS_TO_TRY.filter(m => m !== initialModel)];

  let finalPrompt = prompt;
  if (!pdfText && base64Image) {
    const isActuallyBase64 = base64Image.length > 100 && !base64Image.includes(" ");
    if (isActuallyBase64) {
      try {
        const sanitizedBase64 = base64Image.trim().replace(/\s/g, '');
        const formattedImage = sanitizedBase64.startsWith('data:') ? sanitizedBase64 : `data:image/jpeg;base64,${sanitizedBase64}`;
        const ocrResult = await Tesseract.recognize(formattedImage, 'por+eng');
        finalPrompt = `TEXTO DO DOCUMENTO (OCR):\n${ocrResult.data.text}\n\nSOLICITAÇÃO:\n${prompt}`;
      } catch (e) {
        console.warn("OCR falhou");
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
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: "Você é um assistente especialista em logística aduaneira. A saída DEVE ser obrigatoriamente um objeto JSON válido, sem nenhum texto adicional." },
          { role: "user", content: finalPrompt }
        ],
        model: modelName,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content || "";
      const cleaned = cleanJsonString(content);
      const result = JSON.parse(cleaned);
      if (typeof localStorage !== 'undefined') localStorage.setItem('GROQ_MODEL', modelName);
      return result;
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error.status === 429 || error.message?.toLowerCase().includes("limit") || error.message?.includes("quota");
      const isNotFound = error.message?.includes("decommissioned") || error.status === 404 || error.status === 400;

      if (isRateLimit || isNotFound) {
        console.warn(`Groq: Modelo ${modelName} falhou (${isRateLimit ? 'Limite' : 'Erro'}), tentando próximo...`);
        continue;
      }
      throw new Error(`Falha no Groq (${modelName}): ${error.message}`);
    }
  }
  throw new Error(`Todos os modelos do Groq falharam. Último erro: ${lastError?.message}`);
};

export const parseDocumentWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<DocumentData> => {
  const prompt = `Analise este documento de embarque e extraia: Tipo de Documento, Número do BL, Peso Bruto Total, CBM Total (Volume), Quantidade Total de Volumes. 
  IMPORTANTE: Se houver várias linhas de itens ou containers, você DEVE SOMAR todos os pesos, CBMs e quantidades para retornar apenas o TOTAL CONSOLIDADO do documento.
  
  Retorne EXATAMENTE este JSON:
  { "type": "string", "number": "string", "weight": number, "cbm": number, "packages": number }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parseCIWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise esta Commercial Invoice e extraia: PO, Fornecedor, Valor Total, Moeda e QUANTIDADE TOTAL DE ITENS.
  IMPORTANTE: Se a fatura tiver vários itens, você DEVE SOMAR as quantidades de todos os itens para retornar a QUANTIDADE TOTAL GERAL.
  
  Retorne EXATAMENTE este JSON:
  { "po": "string", "supplier": "string", "totalValue": number, "currency": "string", "totalQuantity": number }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parsePLWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise este Packing List e extraia: Quantidade Total de Volumes (Cartons/Packages), QUANTIDADE TOTAL DE ITENS (Units/Pcs) e CBM Total.
  IMPORTANTE: Se houver várias linhas, você DEVE SOMAR todos os volumes, itens e CBM para retornar o TOTAL CONSOLIDADO.
  
  Retorne EXATAMENTE este JSON:
  { "totalPackages": number, "totalQuantity": number, "totalCbm": number }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const parsePLFromTextWithGroq = async (text: string): Promise<any> => {
  return await parsePLWithGroq("", "", text);
};

export const parseFreightDocumentWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<FreightData> => {
  const prompt = `Analyze this Freight document. Extract Agent Name, items with value/currency, and exchangeRate. Return JSON.`;
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
  const prompt = `Você é um Auditor Sênior de Qualidade e Engenharia. 
  Sua tarefa é criar um questionário técnico rigoroso para homologação de fornecedores internacionais, focado em EVITAR DOWNGRADE de componentes.
  
  Baseado nestas especificações: ${productSpec}
  
  Gere um questionário que:
  1. Questione especificamente cada ponto crítico (ex: se o motor é exatamente o modelo citado, se o material é S/S304 real).
  2. Peça confirmação de padrões de segurança e certificações.
  3. Seja escrito em tom profissional de auditoria.
  
  Retorne um JSON com:
  - "portuguese": O questionário formatado em tópicos claros em Português.
  - "english": O mesmo questionário em Inglês Técnico.
  - "tsv": Uma versão simplificada para Excel (Pergunta\\tResposta_Esperada).`;
  
  return await callAI(prompt);
};

export const compareFreightQuotesWithGroq = async (quotes: any[]): Promise<{ summary: string }> => {
  const prompt = `Compare these freight quotes: ${JSON.stringify(quotes)}. Provide a summary.`;
  const resp = await callAI(prompt);
  return { summary: resp.summary || JSON.stringify(resp) };
};

export const parsePaymentReceiptWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise profundamente este documento de importação (Commercial Invoice, Proforma ou SWIFT/Comprovante Bancário). 
  Sua missão é extrair os dados financeiros com precisão absoluta.

  INSTRUÇÕES ESPECÍFICAS:
  1. Procure pelo Nome do Exportador/Fornecedor (Supplier).
  2. Identifique o número da fatura (CI/PI/Invoice Number).
  3. Busque o VALOR TOTAL (Total Amount Due). Ignore subtotais se houver um total final.
  4. EXTRAIA TODOS OS DADOS BANCÁRIOS: Beneficiário, Banco, Agência, Conta, Código SWIFT/BIC e IBAN. Formate isso em um bloco de texto amigável.
  5. Identifique se há menção a containers.

  Retorne EXATAMENTE este formato JSON:
  {
    "supplierName": "nome do fornecedor",
    "ciNumber": "número da invoice ou pedido",
    "contractTotal": 0,
    "containerNumber": "números dos containers se houver",
    "bankDetails": "Texto completo com Beneficiário, Banco, Conta e SWIFT",
    "milestones": [
      { "description": "ex: 30% Advance", "percentage": 30, "amount": 0, "isPaid": false, "date": "YYYY-MM-DD" }
    ]
  }

  TEXTO EXTRAÍDO DO DOCUMENTO:
  ${pdfText}
  ${base64Data ? "\n(Também utilize a imagem/PDF para validar dados visuais)" : ""}`;
  
  return await callAI(prompt, base64Data);
};

export const compareDocumentsWithGroq = async (bl: any, ci: any, pl: any): Promise<any> => {
  const prompt = `Você é um Auditor Aduaneiro Senior. Sua tarefa é realizar o cruzamento de dados entre três documentos (BL, CI e PL) seguindo RIGOROSAMENTE estas regras:
  
  1. Cruzamento BL vs PL: Compare APENAS as quantidades totais de volumes e o CBM (m3).
  2. Cruzamento CI vs PL: Compare APENAS as quantidades de itens (unidades/peças).
  
  Dados recebidos:
  - BL: ${JSON.stringify(bl)}
  - CI: ${JSON.stringify(ci)}
  - PL: ${JSON.stringify(pl)}
  
  Retorne EXATAMENTE este JSON:
  {
    "discrepancies": [
      { "field": "Documento (ex: BL vs PL)", "message": "Descrição da divergência de quantidade ou CBM" }
    ]
  }`;
  return await callAI(prompt);
};

export const consolidateDocumentsWithGroq = async (docs: any[]): Promise<any> => {
  const prompt = `Consolidate these docs: ${JSON.stringify(docs)}. Return JSON.`;
  return await callAI(prompt);
};

export const generateLIDraftWithGroq = async (bl?: any, ci?: any, pl?: any): Promise<string> => {
  const prompt = `Você é um Despachante Aduaneiro Senior. Sua tarefa é gerar um rascunho de Licença de Importação (LI) que replique FIELMENTE a estrutura oficial do Siscomex, baseando-se nos dados: 
  BL: ${JSON.stringify(bl)}
  CI: ${JSON.stringify(ci)}
  PL: ${JSON.stringify(pl)}
  
  O rascunho DEVE ser organizado nestas seções EXATAS:
  
  1. INFORMAÇÕES DA LI: (Licenciamento: TBA, Data/Hora Registro: [DATA ATUAL], Situação: EM ELABORAÇÃO)
  2. BÁSICAS: (Dados do Importador: Nome, CNPJ, Razão Social, Endereço Completo, Cidade/UF, CEP, Telefone)
  3. OUTRAS INFORMAÇÕES: (País de Procedência, URF de Despacho, URF de Entrada)
  4. NEGOCIAÇÃO: (Regime de Tributação, Cobertura Cambial, Modalidade de Pagamento, Instituição Financeira)
  5. DETALHES DA MERCADORIA: (Para cada produto: Unidade Comercializada, Peso Líquido, Qtde, Valor Unitário, Valor Total e uma ESPECIFICAÇÃO DETALHADA incluindo Modelo, Marca e Características)
  6. TOTALIZADORES: (Peso Líquido Total, Valor Total no Local de Embarque)
  7. INFORMAÇÕES COMPLEMENTARE: (Ref. Containers, Fatura Comercial, Packing List, E-mail de contato)
  
  Retorne EXATAMENTE este JSON:
  {
    "draft": "TEXTO DO RASCUNHO FORMATADO CONFORME O PADRÃO SISCOMEX ACIMA"
  }`;
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
  const prompt = `Analise este documento (CI ou PL) e extraia dados logísticos consolidados.
  IMPORTANTE: Se houver vários itens ou containers, você DEVE SOMAR todos os pesos, CBMs e pacotes para retornar o TOTAL GERAL.
  
  Retorne EXATAMENTE este JSON: 
  { "origin": "Porto/Cidade", "destination": "Porto/Cidade", "weight": number, "cbm": number, "packages": number, "incoterm": "string", "commodity": "string" }`;
  return await callAI(prompt, base64Data, pdfText);
};

export const generateFreightRequestWithGroq = async (logisticsData: any): Promise<string> => {
  const prompt = `Gere um texto profissional para solicitação de cotação de frete internacional (Booking Request) baseado nos dados: ${JSON.stringify(logisticsData)}. O texto deve ser em Português, direto e conter todos os detalhes técnicos para o agente de carga. Responda apenas com o texto final.`;
  const groq = getGroqClient();
  if (!groq) throw new Error("Chave Groq não configurada.");
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: getGroqModel(),
    temperature: 0.7,
  });
  return completion.choices[0]?.message?.content || "";
};
export const compareFreightDocumentsWithGroq = async (quote: FreightData, invoice: FreightData): Promise<FreightComparison> => {
  const prompt = `Compare these two freight documents. Quote: ${JSON.stringify(quote)}, Invoice: ${JSON.stringify(invoice)}. Identify items with different values. Return a JSON with a 'differences' array containing { itemName: string, quoteValue: number, invoiceValue: number, currency: string, status: 'match'|'mismatch' }.`;
  return await callAI(prompt);
};

export const parseArrivalScheduleWithGroq = async (base64Data: string, mimeType: string, pdfText?: string): Promise<any> => {
  const prompt = `Analise este documento (Bill of Lading, Packing List ou Invoice) e extraia um cronograma de chegada de mercadorias.
  Sua missão é agrupar os itens por containers ou lotes e consolidar as quantidades.
  IMPORTANTE: Se o mesmo produto aparecer em vários containers, você DEVE SOMAR as quantidades para mostrar o total do embarque.
  
  Retorne um JSON com a propriedade "items", que é um array de objetos:
  - "containers": Ex: "FANU321383/4, TCNU700401/9". Liste todos os containers onde o produto está.
  - "description": Nome principal do produto BEM SIMPLIFICADO. Ex: "VAPORIZADOR DE OZONIO".
  - "model": O modelo específico (ex: "K238A").
  - "quantity": QUANTIDADE TOTAL SOMADA de todas as linhas deste produto.
  - "cbm": O volume em CBM (metros cúbicos). Ex: "68.5". Se não encontrar, retorne "0".
  - "packages": A quantidade de pacotes/caixas. Ex: "676". Se não achar, retorne "0".
  - "weight": O peso bruto (GWK). Ex: "10816.000". Se não achar, retorne "0".
  - "voltage": A voltagem elétrica mencionada no produto (ex: "110V", "220V", "Bivolt"). Se não houver ou não for aplicável, retorne vazio "".
  - "etaDate": Data estimada no formato YYYY-MM-DD. Se não achar ou não houver (ex: fase de produção), retorne vazio "".
  - "status": Estime o status baseando-se no contexto logístico: "arrived" (verde), "transit" (amarelo), ou "factory" (laranja/produção). Se for apenas uma CI de pedido/produção, use "factory".

  Exemplo: { "items": [{ "containers": "CTN 53", "description": "VAPORIZADOR DE OZONIO", "model": "K238A", "cbm": "68.5", "packages": "676", "weight": "10816", "voltage": "110V", "etaDate": "2026-03-20", "status": "arrived" }] }
  Retorne APENAS o JSON válido.`;
  return await callAI(prompt, base64Data, pdfText);
};
