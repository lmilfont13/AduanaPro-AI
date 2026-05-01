import React, { useState } from 'react';
import { FileDown, RefreshCw, Copy, Download, Zap } from 'lucide-react';
import { generateLIDraft } from '../services/geminiService';
import { generateLIDraftWithGroq } from '../services/groqService';
import { toast } from 'sonner';

interface LIGeneratorProps {
  aiEngine: "gemini" | "groq";
  blData?: any;
  ciData?: any;
  plData?: any;
}

export const LIGenerator = React.memo(({ aiEngine, blData, ciData, plData }: LIGeneratorProps) => {
  const [liDraft, setLiDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!blData && !ciData) {
      toast.error("Por favor, carregue o BL ou a CI no módulo de Auditoria primeiro.");
      return;
    }
    setLoading(true);
    try {
      const draft = aiEngine === 'gemini' 
        ? await generateLIDraft(blData, ciData, plData)
        : await generateLIDraftWithGroq(blData, ciData, plData);
      setLiDraft(draft);
      toast.success("Rascunho de LI gerado com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao gerar LI: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(liDraft);
    toast.success("Texto Copiado!");
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <header className="flex items-center gap-6 mb-10 bg-white p-10 rounded-[48px] border border-slate-200 shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-5"><FileDown size={120} /></div>
         <div className="w-16 h-16 bg-red-500 rounded-[24px] flex items-center justify-center text-white shadow-2xl shadow-red-500/20 relative z-10"><FileDown size={32} /></div>
         <div className="relative z-10">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">Gerador de LI (Siscomex)</h2>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Criação de Rascunho Inteligente IA</p>
         </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4">
           <div className="bg-white p-10 rounded-[56px] border border-slate-200 shadow-xl space-y-8 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mx-auto shadow-sm"><Zap size={36} /></div>
              <div className="space-y-4">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Motor de Inteligência</h3>
                 <p className="text-xs text-slate-400 font-bold leading-relaxed uppercase tracking-widest">A IA analisará os documentos carregados no dashboard para compor o texto base da Licença de Importação.</p>
              </div>
              <button onClick={handleGenerate} disabled={loading} className="w-full py-6 bg-red-500 text-white rounded-[32px] font-black uppercase tracking-widest shadow-2xl shadow-red-500/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3">
                 {loading ? <RefreshCw className="animate-spin" /> : <FileDown size={24} />}
                 {loading ? 'Consultando IA...' : 'Gerar Rascunho'}
              </button>
           </div>
        </div>

        <div className="lg:col-span-8">
           <div className="bg-white p-12 rounded-[56px] border border-slate-200 shadow-xl min-h-[600px] flex flex-col relative overflow-hidden">
              <div className="flex items-center justify-between mb-8 border-b pb-6 relative z-10">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Texto do Rascunho</h3>
                 {liDraft && (
                    <div className="flex gap-4">
                       <button onClick={copyToClipboard} className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all"><Copy size={20} /></button>
                    </div>
                 )}
              </div>
              
              <div className="flex-1 bg-slate-50 rounded-[40px] border border-slate-100 p-10 relative z-10">
                 {liDraft ? (
                    <pre className="text-xs font-mono text-slate-700 leading-relaxed whitespace-pre-wrap">{liDraft}</pre>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4 py-20">
                       <FileDown size={64} strokeWidth={1} />
                       <p className="font-black uppercase tracking-[0.4em] text-xs">Aguardando comando de geração</p>
                    </div>
                 )}
              </div>
              <div className="absolute bottom-0 right-0 p-20 opacity-[0.02] pointer-events-none"><FileDown size={400} /></div>
           </div>
        </div>
      </div>
    </div>
  );
});
