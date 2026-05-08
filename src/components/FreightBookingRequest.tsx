import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, Zap, Copy, MessageSquare, Ship, ArrowRight, Package, Hash, DollarSign } from 'lucide-react';
import { parseLogisticsDataWithGroq, generateFreightRequestWithGroq } from '../services/groqService';
import { extractTextFromPDF, pdfToImage } from '../services/pdfService';
import { toast } from 'sonner';

import { useDropzone } from 'react-dropzone';

export default function FreightBookingRequest() {
  const [ciFile, setCiFile] = useState<File | null>(null);
  const [plFile, setPlFile] = useState<File | null>(null);
  const [ciData, setCiData] = useState<any>(null);
  const [plData, setPlData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState("");

  const handleFileDrop = (file: File, type: 'CI' | 'PL') => {
    if (type === 'CI') {
      setCiFile(file);
      setCiData(null);
    } else {
      setPlFile(file);
      setPlData(null);
    }
    toast.success(`${type} carregada! Clique em 'Extrair Dados' para processar.`);
  };

  React.useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) handleFileDrop(file, 'CI');
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const processAndExtract = async () => {
    if (!ciFile && !plFile) {
      toast.error("Carregue pelo menos um arquivo.");
      return;
    }
    setLoading(true);
    try {
      const extract = async (file: File) => {
        let pdfText = "";
        let visualBase64 = "";

        if (file.type === "application/pdf") {
          try {
            pdfText = await extractTextFromPDF(file);
          } catch (e) {
            console.warn("Texto do PDF não legível, tentando renderizar imagem...");
          }
          try {
            visualBase64 = await pdfToImage(file);
          } catch (e) {
            console.warn("Falha ao renderizar imagem do PDF.");
          }
        }

        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.includes(',') ? res.split(',')[1] : res);
          };
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        // Se for PDF e conseguimos imagem, usamos a imagem para a IA (Vision)
        // Caso contrário, usamos o base64 do próprio arquivo (OCR tradicional)
        const finalBase64 = visualBase64 || fileBase64;

        return await parseLogisticsDataWithGroq(finalBase64, file.type, pdfText);
      };

      if (ciFile) {
        const data = await extract(ciFile);
        setCiData(data);
      }
      if (plFile) {
        const data = await extract(plFile);
        setPlData(data);
      }
      toast.success("Dados extraídos com sucesso!");
    } catch (err: any) {
      toast.error(`Erro na extração: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const { getRootProps: getRootCI, getInputProps: getInputCI } = useDropzone({ onDrop: (f) => handleFileDrop(f[0], 'CI') });
  const { getRootProps: getRootPL, getInputProps: getInputPL } = useDropzone({ onDrop: (f) => handleFileDrop(f[0], 'PL') });

  const handleGenerateText = async () => {
    if (!ciData && !plData) {
      toast.error("Extraia os dados dos documentos primeiro.");
      return;
    }
    setLoading(true);
    try {
      const consolidated = {
        ...(ciData || {}),
        ...(plData || {}),
        weight: plData?.weight || ciData?.weight,
        totalValue: ciData?.totalValue || plData?.totalValue
      };
      const text = await generateFreightRequestWithGroq(consolidated);
      setGeneratedText(text);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex items-center gap-6 mb-10 bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 text-blue-600"><Ship size={120} /></div>
        <div className="w-16 h-16 bg-blue-600 rounded-[24px] flex items-center justify-center text-white shadow-2xl shadow-blue-600/20 relative z-10"><Zap size={32} /></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">Solicitação de Frete</h2>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Geração de Booking Request via IA</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div {...getRootCI()} className={`group p-10 rounded-[48px] bg-white border-2 border-dashed transition-all duration-500 shadow-sm cursor-pointer ${ciFile ? 'border-blue-400 bg-blue-50/20' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30'}`}>
          <input {...getInputCI()} />
          <div className="text-center space-y-6">
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center ${ciFile ? 'bg-blue-500 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
              {ciFile ? <CheckCircle2 size={36} /> : <FileText size={36} />}
            </div>
            <h3 className="font-black uppercase text-slate-800 text-xs">Commercial Invoice</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{ciFile ? ciFile.name : 'Arraste a CI aqui ou Cole (Ctrl+V)'}</p>
          </div>
        </div>

        <div {...getRootPL()} className={`group p-10 rounded-[48px] bg-white border-2 border-dashed transition-all duration-500 shadow-sm cursor-pointer ${plFile ? 'border-blue-400 bg-blue-50/20' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30'}`}>
          <input {...getInputPL()} />
          <div className="text-center space-y-6">
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center ${plFile ? 'bg-blue-500 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
              {plFile ? <CheckCircle2 size={36} /> : <FileText size={36} />}
            </div>
            <h3 className="font-black uppercase text-slate-800 text-xs">Packing List</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{plFile ? plFile.name : 'Arraste a PL aqui ou Cole (Ctrl+V)'}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-center gap-6 pt-6">
        <button 
          onClick={processAndExtract} 
          disabled={loading || (!ciFile && !plFile)}
          className="px-12 py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-4"
        >
          {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Zap size={20} />}
          1. Extrair Totais (IA)
        </button>

        <button 
          onClick={handleGenerateText} 
          disabled={loading || (!ciData && !plData)}
          className="px-12 py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-500 transition-all disabled:opacity-50"
        >
          2. Gerar Texto Booking
        </button>
      </div>

      {(ciData || plData || generatedText) && (
        <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-2xl space-y-8 animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between border-b pb-6">
             <h3 className="text-xl font-black uppercase text-slate-800 flex items-center gap-3">
               <MessageSquare className="text-blue-600" /> Resultados
             </h3>
             {generatedText && (
               <button 
                 onClick={() => { navigator.clipboard.writeText(generatedText); toast.success("Copiado!"); }}
                 className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
               >
                 <Copy size={20} />
               </button>
             )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
             <div className="lg:col-span-1 space-y-6">
                <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-4">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Consolidados</h4>
                   <div className="space-y-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><Hash size={14} /></div>
                         <div><p className="text-[8px] font-bold text-slate-400 uppercase">Operação / PO</p><p className="text-xs font-black text-slate-800">{ciData?.operation || plData?.operation || 'N/I'} / {ciData?.po || plData?.po || 'N/I'}</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><Package size={14} /></div>
                         <div><p className="text-[8px] font-bold text-slate-400 uppercase">Peso / Equipamento</p><p className="text-xs font-black text-slate-800">{(ciData?.weight ?? plData?.weight) ?? 'N/I'} / {ciData?.equipment || plData?.equipment || 'N/I'}</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><DollarSign size={14} /></div>
                         <div><p className="text-[8px] font-bold text-slate-400 uppercase">Valor Mercadoria</p><p className="text-xs font-black text-slate-800">{ciData?.totalValue || plData?.totalValue || 'N/I'}</p></div>
                      </div>
                   </div>
                </div>
             </div>
             <div className="lg:col-span-2">
                <div className="p-10 bg-slate-900 rounded-[40px] text-orange-400 font-mono text-xs leading-relaxed whitespace-pre-wrap min-h-[300px] border border-white/5 shadow-inner">
                   {generatedText || "Clique em 'Gerar Texto Booking' após a extração..."}
                 </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
