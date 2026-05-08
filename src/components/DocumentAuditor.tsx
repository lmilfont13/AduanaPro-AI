import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseDocumentWithGroq, compareDocumentsWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { DocumentData, ComparisonResult } from "../types";
import { toast } from 'sonner';
import { CheckCircle, FileText, ArrowRightLeft, AlertTriangle } from 'lucide-react';

interface DocumentAuditorProps {
  aiEngine?: "gemini" | "groq";
}

export const DocumentAuditor = ({ aiEngine = "groq" }: DocumentAuditorProps) => {
  const [blData, setBlData] = useState<DocumentData | null>(null);
  const [ciData, setCiData] = useState<DocumentData | null>(null);
  const [plData, setPlData] = useState<DocumentData | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  const processFile = async (file: File, type: 'BL' | 'CI' | 'PL') => {
    setLoading(true);
    try {
      const text = await extractTextFromPDF(file);
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      
      const data = await parseDocumentWithGroq(base64, file.type, text);
      if (type === 'BL') setBlData(data);
      else if (type === 'CI') setCiData(data);
      else if (type === 'PL') setPlData(data);
      toast.success(`${type} processado com sucesso!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  };

  const { getRootProps: getRootBL, getInputProps: getInputBL } = useDropzone({ onDrop: (f) => processFile(f[0], 'BL') });
  const { getRootProps: getRootCI, getInputProps: getInputCI } = useDropzone({ onDrop: (f) => processFile(f[0], 'CI') });
  const { getRootProps: getRootPL, getInputProps: getInputPL } = useDropzone({ onDrop: (f) => processFile(f[0], 'PL') });

  const handleCompare = async () => {
    if (!blData || !ciData || !plData) { toast.error("Carregue todos os documentos primeiro."); return; }
    setLoading(true);
    try {
      const result = await compareDocumentsWithGroq(blData, ciData, plData);
      setComparison(result);
    } catch (error: any) { toast.error("Erro na comparação: " + error.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { type: 'BL', data: blData, label: 'Bill of Lading', root: getRootBL, input: getInputBL },
          { type: 'CI', data: ciData, label: 'Commercial Invoice', root: getRootCI, input: getInputCI },
          { type: 'PL', data: plData, label: 'Packing List', root: getRootPL, input: getInputPL }
        ].map((doc) => (
          <div key={doc.type} {...doc.root()} className={`group p-10 rounded-[48px] bg-white border-2 border-dashed transition-all cursor-pointer ${doc.data ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-orange-500 hover:bg-orange-50/10'}`}>
            <input {...doc.input()} />
            <div className="text-center space-y-4">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${doc.data ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
                {doc.data ? <CheckCircle size={32} /> : <FileText size={32} />}
              </div>
              <h3 className="font-black uppercase tracking-tight text-slate-800 text-xs">{doc.label}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{doc.data ? 'Carregado' : 'Arraste Aqui'}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center pt-8">
        <button 
          onClick={handleCompare}
          disabled={loading || !blData || !ciData || !plData}
          className="px-16 py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? 'Processando Auditoria...' : 'Iniciar Auditoria de Dados'}
        </button>
      </div>

      {comparison && (
        <div className="bg-white p-12 rounded-[56px] border border-slate-100 shadow-2xl space-y-8 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-6 border-b border-slate-50 pb-8">
            <div className="w-14 h-14 bg-orange-500 rounded-[20px] flex items-center justify-center text-white shadow-xl shadow-orange-500/20"><ArrowRightLeft size={28} /></div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Resultados da Auditoria</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.isArray(comparison?.discrepancies) ? comparison.discrepancies.map((d, i) => (
              <div key={i} className="p-8 rounded-[32px] bg-rose-50 border border-rose-100 flex gap-5">
                <AlertTriangle className="text-rose-500 shrink-0" size={28} />
                <div className="space-y-1">
                  <p className="font-black text-rose-900 uppercase text-[10px] tracking-widest">{String(d?.field || 'Campo')}</p>
                  <p className="text-sm text-rose-700 font-bold leading-tight">{String(d?.message || 'Inconsistência detectada')}</p>
                </div>
              </div>
            )) : (
              <div className="col-span-2 p-8 rounded-[32px] bg-emerald-50 border border-emerald-100 flex items-center gap-4">
                <CheckCircle className="text-emerald-500" />
                <p className="font-bold text-emerald-700">Nenhuma discrepância crítica encontrada.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
