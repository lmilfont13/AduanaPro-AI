import React, { useState } from 'react';
import { ShieldCheck, Copy, Sparkles, Languages, ArrowRight, Globe, Download } from 'lucide-react';
import { generateSupplierQuestionnaire } from '../services/geminiService';
import { generateSupplierQuestionnaireWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

interface SupplierMatchProps {
  aiEngine: "gemini" | "groq";
}

export default function SupplierMatch({ aiEngine }: SupplierMatchProps) {
  const [productSpec, setProductSpec] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ english: string, portuguese: string, tsv: string } | null>(null);

  const formatAIResponse = (data: any): string => {
    if (typeof data === 'string') return data;
    if (!data) return "";
    
    // Se for um objeto, vamos transformá-lo em uma lista legível
    if (typeof data === 'object') {
      return Object.entries(data).map(([key, value]) => {
        const cleanKey = key.replace(/_/g, ' ').toUpperCase();
        if (typeof value === 'object' && value !== null) {
          return `\n[${cleanKey}]\n${formatAIResponse(value)}`;
        }
        return `• ${cleanKey}: ${value}`;
      }).join('\n');
    }
    return String(data);
  };

  const handleGenerate = async () => {
    if (!productSpec.trim()) { toast.error("Cole as especificações ou arraste um PDF primeiro."); return; }
    setIsGenerating(true);
    setResult(null);
    try {
      let data: any;
      if (aiEngine === "gemini") data = await generateSupplierQuestionnaire(productSpec);
      else data = await generateSupplierQuestionnaireWithGroq(productSpec);
      
      // Validação e Formatação Inteligente
      const rawPort = data?.portuguese || data?.questionario_fornecedor || data?.resultado || data;
      const rawEng = data?.english || data?.supplier_questionnaire || data?.result || data;

      const validatedData = {
        portuguese: formatAIResponse(rawPort),
        english: formatAIResponse(rawEng),
        tsv: typeof data?.tsv === 'string' ? data.tsv : ""
      };

      if (!validatedData.english && !validatedData.portuguese) {
        throw new Error("A IA retornou um formato inesperado.");
      }

      setResult(validatedData);
    } catch (error: any) { 
      const errorMsg = typeof error === 'string' ? error : (error?.message || "Erro na geração");
      toast.error(`Erro: ${errorMsg}`); 
    }
    finally { setIsGenerating(false); }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type === 'application/pdf') {
      setIsGenerating(true);
      try {
        const text = await extractTextFromPDF(file);
        setProductSpec(text);
        toast.success("Texto extraído do PDF com sucesso!");
      } catch (e) {
        toast.error("Erro ao ler o PDF.");
      } finally {
        setIsGenerating(false);
      }
    } else {
      toast.error("Por favor, envie apenas arquivos PDF.");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    noClick: true, // Allow clicking the textarea normally
    accept: { 'application/pdf': ['.pdf'] }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
         <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white"><ShieldCheck size={24} /></div>
         <div><h2 className="text-2xl font-black text-slate-900 uppercase">Homologação de Fornecedores</h2><p className="text-sm text-slate-500 font-bold">Geração de questionários técnicos anti-downgrade</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1" {...getRootProps()}>
           <input {...getInputProps()} />
           <div className={`bg-white p-8 rounded-[40px] border-2 transition-all shadow-sm space-y-6 ${isDragActive ? 'border-purple-500 bg-purple-50/50' : 'border-slate-200'}`}>
              <div className="flex justify-between items-center border-b pb-4">
                <h3 className="font-black uppercase text-slate-800 text-sm">Especificações</h3>
                <Sparkles size={16} className="text-purple-500 animate-pulse" />
              </div>
              
              <div className="relative group">
                <textarea 
                  placeholder="Cole aqui a ficha técnica ou arraste um PDF..." 
                  value={productSpec} 
                  onChange={(e) => setProductSpec(e.target.value)} 
                  className="w-full h-64 p-6 bg-slate-50 border-none rounded-[32px] text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none resize-none" 
                />
                {isDragActive && (
                  <div className="absolute inset-0 bg-purple-600/90 rounded-[32px] flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in zoom-in duration-200">
                    <Download size={48} className="mb-4 animate-bounce" />
                    <p className="font-black uppercase text-sm tracking-widest">Solte para Extrair</p>
                  </div>
                )}
              </div>

              <button 
                onClick={handleGenerate} 
                disabled={isGenerating} 
                className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Processando...</span>
                  </div>
                ) : 'Gerar Questionário'}
              </button>
           </div>
        </div>

        <div className="lg:col-span-2">
           {result ? (
             <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8 min-h-[500px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-8 bg-purple-50 rounded-[32px] border border-purple-100 shadow-inner">
                       <h4 className="font-black uppercase text-purple-900 text-[11px] tracking-widest mb-6 flex items-center gap-3"><Languages size={18} /> Questionário em Português</h4>
                       <div className="text-sm text-purple-950 font-bold leading-relaxed whitespace-pre-wrap font-sans">
                         {result.portuguese}
                       </div>
                    </div>
                    <div className="p-8 bg-slate-900 rounded-[32px] text-white shadow-2xl">
                       <h4 className="font-black uppercase text-slate-400 text-[11px] tracking-widest mb-6 flex items-center gap-3"><Globe size={18} /> English Questionnaire</h4>
                       <div className="text-sm text-slate-100 font-medium leading-relaxed whitespace-pre-wrap font-mono">
                         {result.english}
                       </div>
                    </div>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(result.tsv); toast.success("Copiado para o Excel!"); }} className="w-full py-4 bg-green-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-green-500/20 flex items-center justify-center gap-3"><Download size={20} /> Copiar para Excel (TSV)</button>
             </div>
           ) : (
             <div className="bg-white p-8 rounded-[40px] border border-slate-200 border-dashed flex items-center justify-center min-h-[500px] text-slate-300 font-black uppercase tracking-widest">Aguardando Especificações</div>
           )}
        </div>
      </div>
    </div>
  );
}
