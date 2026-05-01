import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js se ainda não estiver configurado
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export const extractTextFromPDF = async (data: File | string): Promise<string> => {
  try {
    let uint8Array: Uint8Array;

    if (data instanceof File) {
      const arrayBuffer = await data.arrayBuffer();
      uint8Array = new Uint8Array(arrayBuffer);
    } else {
      // Método ultra-robusto usando fetch para decodificar Data URL ou Base64 puro
      const dataUrl = data.startsWith('data:') ? data : `data:application/pdf;base64,${data.trim().replace(/\s/g, '')}`;
      const response = await fetch(dataUrl);
      const arrayBuffer = await response.arrayBuffer();
      uint8Array = new Uint8Array(arrayBuffer);
    }

    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  } catch (error) {
    console.error("Erro ao extrair texto do PDF:", error);
    throw new Error("Não foi possível ler o conteúdo do PDF. Certifique-se de que não está protegido por senha ou corrompido.");
  }
};
