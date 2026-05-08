import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  DollarSign, 
  Clock, 
  ShieldCheck, 
  Trash2, 
  Zap, 
  ArrowRightLeft,
  Bot,
  Ship,
  Check
} from 'lucide-react';
import { parseFreightDocument, compareFreightQuotes } from '../services/geminiService';
import { parseFreightDocumentWithGroq, compareFreightQuotesWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { FreightData } from '../types';
import { toast } from 'sonner';

interface FreightComparisonProps {
  engine: "gemini" | "groq" | "deepseek";
}

export default function FreightQuoteComparison({ engine }: FreightComparisonProps) {
  const [proposals, setProposals] = useState<FreightData[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{ tableData: any[], summary: string } | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setLoading(true);
    const newProposals: FreightData[] = [];
    
    for (const file of acceptedFiles) {
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;
        
        let data: FreightData;
        
        if (engine === "gemini") {
          data = await parseFreightDocument(base64, file.type);
        } else {
          let pdfText = "";
          if (file.type === "application/pdf") {
            try {
              pdfText = await extractTextFromPDF(base64);
            } catch (err) {
              console.warn("Falha na extração de texto do PDF, tentando OCR...", err);
            }
          }
          data = await parseFreightDocumentWithGroq(base64, file.type, pdfText);
        }

        const isFreightDoc = data.documentType === 'QUOTE' || 
                            data.documentType === 'INVOICE' || 
                            (data.totalUSD > 0 || data.totalBRL > 0) ||
                            (data.originalUSD > 0 || data.originalBRL > 0);

        if (isFreightDoc) {
          newProposals.push({ 
            ...data, 
            documentType: data.documentType || 'QUOTE',
            agentName: data.agentName || file.name 
          });
          toast.success(`Proposta de ${data.agentName || file.name} processada!`);
        } else {
          toast.error(`Arquivo ${file.name} não parece ser um orçamento de frete.`);
        }

        if (engine === "groq") {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        console.error(error);
        toast.error(`Erro ao processar ${file.name}: ${error.message || "Erro desconhecido"}`);
      }
    }
    
    setProposals(prev => [...prev, ...newProposals]);
    setLoading(false);
  }, [engine]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'application/pdf': ['.pdf'] }
  });

  const handleCompare = async () => {
    if (proposals.length < 2) {
      toast.error("Adicione pelo menos duas propostas para comparar.");
      return;
    }
    
    setLoading(true);
    try {
      const tableData = proposals.map(prop => {
        const rate = prop.exchangeRate || 5.2;
        const oceanUSD = prop.originalUSD || 0;
        const localBRL = prop.originalBRL || 0;
        const totalBRL = (oceanUSD * rate) + localBRL;
        
        return {
          agent: prop.agentName,
          oceanFreightUSD: oceanUSD,
          localFeesBRL: localBRL,
          exchangeRate: rate,
          transitTime: prop.transitTime || "N/I",
          freeTime: prop.freeTime || "N/I",
          totalConvertedBRL: totalBRL,
          isBest: false
        };
      });

      const minTotal = Math.min(...tableData.map(d => d.totalConvertedBRL));
      tableData.forEach(d => d.isBest = d.totalConvertedBRL === minTotal);

      const aiResponse = engine === "gemini"
        ? await compareFreightQuotes(tableData)
        : await compareFreightQuotesWithGroq(tableData);

      setComparisonResult({
        tableData,
        summary: aiResponse.summary || "Comparativo gerado com base nos valores revisados."
      });
      toast.success("Comparativo gerado!");
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro: ${error.message || "Erro interno"}`);
    } finally {
      setLoading(false);
    }
  };

  const updateProposal = (idx: number, field: keyof FreightData, value: any) => {
    setProposals(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const removeProposal = (index: number) => {
    setProposals(prev => prev.filter((_, i) => i !== index));
    if (comparisonResult) setComparisonResult(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-[48px] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-10 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-2xl text-white">
              <Ship size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase">Comparativo de Propostas</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Análise de fretes internacionais</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest">
            Audit Engine: {engine}
          </div>
        </div>

        <div className="p-10 space-y-10">
          <div 
            {...getRootProps()} 
            className={`border-4 border-dashed rounded-[40px] p-16 text-center transition-all cursor-pointer ${
              isDragActive ? 'border-blue-500 bg-blue-50 scale-[0.98]' : 'border-slate-100 hover:border-blue-400 hover:bg-slate-50/50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300">
                <Upload size={40} />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-black text-slate-800 uppercase">Arraste os orçamentos (PDF)</p>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Compare múltiplos agentes simultaneamente</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {proposals.map((prop, idx) => (
              <div 
                key={idx}
                className="relative p-8 bg-white border border-slate-100 rounded-[32px] shadow-sm hover:shadow-xl transition-all group"
              >
                  <button 
                    onClick={() => removeProposal(idx)}
                    className="absolute -top-3 -right-3 w-10 h-10 bg-white text-rose-500 rounded-full flex items-center justify-center shadow-lg border border-rose-50 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                      <FileText size={20} />
                    </div>
                    <div className="overflow-hidden flex-1">
                      <input 
                        value={prop.agentName}
                        onChange={(e) => updateProposal(idx, 'agentName', e.target.value)}
                        className="font-black text-sm text-slate-900 uppercase truncate bg-transparent outline-none focus:text-blue-600 w-full"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Frete (USD)</label>
                      <input 
                        type="number"
                        value={prop.originalUSD}
                        onChange={(e) => updateProposal(idx, 'originalUSD', parseFloat(e.target.value) || 0)}
                        className="font-black text-slate-900 bg-transparent outline-none w-full"
                      />
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Taxas (BRL)</label>
                      <input 
                        type="number"
                        value={prop.originalBRL}
                        onChange={(e) => updateProposal(idx, 'originalBRL', parseFloat(e.target.value) || 0)}
                        className="font-black text-slate-900 bg-transparent outline-none w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {proposals.length >= 2 && (
            <div className="flex justify-center pt-6">
              <button 
                onClick={handleCompare} 
                disabled={loading}
                className="px-16 py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'Analisando...' : 'Iniciar Comparativo'}
              </button>
            </div>
          )}
        </div>
      </div>

      {comparisonResult && (
        <div className="space-y-8">
          <div className="bg-white rounded-[48px] border border-slate-100 shadow-2xl overflow-hidden">
              <div className="p-10 bg-emerald-600 flex items-center gap-4 text-white">
                <ShieldCheck size={32} />
                <div>
                  <h3 className="text-2xl font-black uppercase">Resultado da Análise</h3>
                  <p className="text-[10px] font-black uppercase opacity-80 tracking-widest">Inteligência Logística AduanaPro</p>
                </div>
              </div>
              
              <div className="p-10 space-y-10">
                <div className="overflow-x-auto rounded-[32px] border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Agente</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Frete (USD)</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Taxas (BRL)</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Custo Total (BRL)</th>
                        <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Decisão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {comparisonResult.tableData.map((row, i) => (
                        <tr key={i} className={`transition-all ${row.isBest ? 'bg-emerald-50/50' : ''}`}>
                          <td className="p-6 font-black text-slate-900 uppercase text-xs">{row.agent}</td>
                          <td className="p-6 text-center font-bold text-slate-600 text-xs">${row.oceanFreightUSD?.toLocaleString()}</td>
                          <td className="p-6 text-center font-bold text-slate-600 text-xs">R$ {row.localFeesBRL?.toLocaleString()}</td>
                          <td className="p-6 text-center font-black text-blue-600 text-lg">R$ {row.totalConvertedBRL?.toLocaleString()}</td>
                          <td className="p-6 text-center">
                            {row.isBest ? (
                              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20">
                                <Check size={14} /> Melhor Escolha
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-10 bg-slate-950 rounded-[40px] text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform">
                    <Bot size={120} />
                  </div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex items-center gap-3">
                      <Zap size={24} className="text-orange-500" fill="currentColor" />
                      <h4 className="text-xl font-black uppercase tracking-tighter">Resumo Estratégico</h4>
                    </div>
                    <p className="text-slate-400 leading-relaxed font-medium text-sm">
                      {comparisonResult.summary}
                    </p>
                  </div>
                </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
