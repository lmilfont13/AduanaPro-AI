import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, Zap, Copy, MessageSquare, Ship, ArrowRight, Package } from 'lucide-react';
import { parseLogisticsDataWithGroq, generateFreightRequestWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { toast } from 'sonner';

import { useDropzone } from 'react-dropzone';

export default function FreightBookingRequest() {
  const [ciData, setCiData] = useState<any>(null);
  const [plData, setPlData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState("");

  const onDropCI = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]; if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      const data = await parseLogisticsDataWithGroq(base64, file.type);
      setCiData(data);
      toast.success(`CI analisada com sucesso!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  };

  const onDropPL = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]; if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      const data = await parseLogisticsDataWithGroq(base64, file.type);
      setPlData(data);
      toast.success(`PL analisada com sucesso!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  };

  const { getRootProps: getRootCI, getInputProps: getInputCI } = useDropzone({ onDrop: onDropCI });
  const { getRootProps: getRootPL, getInputProps: getInputPL } = useDropzone({ onDrop: onDropPL });

  // ... (rest of the component logic)

  const handleGenerateText = async () => {
    if (!ciData && !plData) {
      toast.error("Carregue pelo menos um documento (CI ou PL).");
      return;
    }
    setLoading(true);
    try {
      // Consolidando dados
      const consolidated = {
        ...ciData,
        ...plData,
        weight: plData?.weight || ciData?.weight,
        cbm: plData?.cbm || ciData?.cbm,
        packages: plData?.packages || ciData?.packages
      };
      
      const text = await generateFreightRequestWithGroq(consolidated);
      setGeneratedText(text);
      toast.success("Texto de solicitação gerado!");
    } catch (err: any) {
      toast.error(`Erro ao gerar texto: ${err.message}`);
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
        <div {...getRootCI()} className={`group p-10 rounded-[48px] bg-white border-2 border-dashed transition-all duration-500 shadow-sm cursor-pointer ${ciData ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30'}`}>
          <input {...getInputCI()} />
          <div className="text-center space-y-6">
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center ${ciData ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-50 text-slate-300'}`}>
              {ciData ? <CheckCircle2 size={36} /> : <FileText size={36} />}
            </div>
            <h3 className="font-black uppercase text-slate-800 text-xs">Commercial Invoice</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{ciData ? 'CI Carregada' : 'Arraste a CI aqui'}</p>
          </div>
        </div>

        <div {...getRootPL()} className={`group p-10 rounded-[48px] bg-white border-2 border-dashed transition-all duration-500 shadow-sm cursor-pointer ${plData ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30'}`}>
          <input {...getInputPL()} />
          <div className="text-center space-y-6">
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center ${plData ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-50 text-slate-300'}`}>
              {plData ? <CheckCircle2 size={36} /> : <FileText size={36} />}
            </div>
            <h3 className="font-black uppercase text-slate-800 text-xs">Packing List</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{plData ? 'PL Carregada' : 'Arraste a PL aqui'}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-6">
        <button 
          onClick={handleGenerateText} 
          disabled={loading || (!ciData && !plData)}
          className="px-16 py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? 'Analisando Documentos...' : 'Gerar Texto p/ Agentes'}
        </button>
      </div>

      {generatedText && (
        <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-2xl space-y-8 animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between border-b pb-6">
             <h3 className="text-xl font-black uppercase text-slate-800 flex items-center gap-3">
               <MessageSquare className="text-blue-600" /> Texto Sugerido
             </h3>
             <button 
               onClick={() => { navigator.clipboard.writeText(generatedText); toast.success("Texto copiado!"); }}
               className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
             >
               <Copy size={20} />
             </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
             <div className="lg:col-span-1 space-y-6">
                <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-4">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Extraídos</h4>
                   <div className="space-y-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><Package size={14} /></div>
                         <div><p className="text-[8px] font-bold text-slate-400 uppercase">Volumes / Peso</p><p className="text-xs font-black text-slate-800">{ciData?.packages || plData?.packages || 'N/I'} Vol / {ciData?.weight || plData?.weight || 'N/I'}kg</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600"><ArrowRight size={14} /></div>
                         <div><p className="text-[8px] font-bold text-slate-400 uppercase">Origem / Destino</p><p className="text-xs font-black text-slate-800">{ciData?.origin || 'China'} → {ciData?.destination || 'Brasil'}</p></div>
                      </div>
                   </div>
                </div>
             </div>
             <div className="lg:col-span-2">
                <div className="p-10 bg-slate-900 rounded-[40px] text-orange-400 font-mono text-xs leading-relaxed whitespace-pre-wrap min-h-[300px] border border-white/5 shadow-inner">
                   {generatedText}
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
