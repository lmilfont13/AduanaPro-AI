import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js usando CDN para máxima compatibilidade
if (typeof window !== 'undefined') {
  // Usar a versão legado do worker para maior compatibilidade com navegadores e ambientes de build
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
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

export const pdfToImage = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 4.0 }); // Aumentado para 4.0 para máxima nitidez
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  if (!context) throw new Error("Could not create canvas context");

  await page.render({ canvasContext: context, viewport, canvas: canvas }).promise;
  return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]; // Qualidade 0.95
};
