import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, AlertTriangle, CheckCircle2, Ship } from 'lucide-react';
import { parseFreightDocumentWithGroq, compareFreightDocumentsWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { FreightData, FreightComparison } from '../types';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

interface Props {
  aiEngine?: "gemini" | "groq";
}

export default function FreightAuditor({ aiEngine = "groq" }: Props) {
  const [quoteData, setQuoteData] = useState<FreightData | null>(null);
  const [invoiceData, setInvoiceData] = useState<FreightData | null>(null);
  const [comparison, setComparison] = useState<FreightComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(5.80);

  const processFile = async (file: File, type: "QUOTE" | "INVOICE") => {
    setLoading(true);
    try {
      const text = await extractTextFromPDF(file);
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      
      const data = await parseFreightDocumentWithGroq(base64, file.type, text);
      if (type === "QUOTE") setQuoteData(data);
      else setInvoiceData(data);
      if (data.exchangeRate) setExchangeRate(data.exchangeRate);
      toast.success(`${type === 'QUOTE' ? 'Orçamento' : 'Fatura'} processado!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  };

  const { getRootProps: getRootQuote, getInputProps: getInputQuote } = useDropzone({ onDrop: (f) => processFile(f[0], "QUOTE") });
  const { getRootProps: getRootInvoice, getInputProps: getInputInvoice } = useDropzone({ onDrop: (f) => processFile(f[0], "INVOICE") });

  const handleCompare = async () => {
    if (!quoteData || !invoiceData) { toast.error("Carregue Orçamento e Fatura primeiro."); return; }
    setLoading(true);
    try {
      const result = await compareFreightDocumentsWithGroq(quoteData, invoiceData);
      setComparison(result);
    } catch (error: any) { toast.error("Erro na comparação: " + error.message); }
    finally { setLoading(false); }
  };

  const generatePDF = () => {
    if (!comparison || !quoteData || !invoiceData) return;
    const doc = new jsPDF();
    doc.text("NOTIFICAÇÃO DE DIVERGÊNCIA", 14, 20);
    comparison.differences.forEach((d, i) => {
       doc.text(`${d.itemName}: Orçado ${d.currency}${d.quoteValue.toFixed(2)} | Faturado ${d.currency}${d.invoiceValue.toFixed(2)}`, 14, 30 + (i * 10));
    });
    doc.save("Auditoria_Frete.pdf");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
         <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
            <Ship size={24} />
         </div>
         <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase">Auditoria de Fretes</h2>
            <p className="text-sm text-slate-500 font-bold">Compare orçamentos de agentes com faturas finais</p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div {...getRootQuote()} className={`p-10 rounded-[48px] bg-white border-2 border-dashed transition-all cursor-pointer shadow-sm ${quoteData ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/10'}`}>
          <input {...getInputQuote()} />
          <div className="text-center space-y-4">
            <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${quoteData ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
              {quoteData ? <CheckCircle2 size={32} /> : <FileText size={32} />}
            </div>
            <h3 className="font-black uppercase text-slate-800 text-xs">Orçamento (Quote)</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{quoteData ? 'Carregado' : 'Arraste Aqui'}</p>
          </div>
        </div>

        <div {...getRootInvoice()} className={`p-10 rounded-[48px] bg-white border-2 border-dashed transition-all cursor-pointer shadow-sm ${invoiceData ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/10'}`}>
          <input {...getInputInvoice()} />
          <div className="text-center space-y-4">
            <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${invoiceData ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
              {invoiceData ? <CheckCircle2 size={32} /> : <FileText size={32} />}
            </div>
            <h3 className="font-black uppercase text-slate-800 text-xs">Fatura (Debit Note)</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{invoiceData ? 'Carregado' : 'Arraste Aqui'}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 pt-8">
        <button onClick={handleCompare} disabled={loading || !quoteData || !invoiceData} className="px-16 py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
          {loading ? 'Analisando Discrepâncias...' : 'Iniciar Auditoria de Frete'}
        </button>
        {comparison && (
          <button onClick={generatePDF} className="px-10 py-6 bg-white border border-slate-200 text-slate-900 rounded-[32px] font-black uppercase text-xs hover:bg-slate-50 transition-all shadow-xl">
             Exportar Notificação
          </button>
        )}
      </div>

      {comparison && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-200 space-y-6 shadow-sm">
           <h3 className="text-xl font-black uppercase text-slate-900 flex items-center gap-3">
              <AlertTriangle className="text-amber-500" /> Detalhamento
           </h3>
           <div className="overflow-x-auto">
             <table className="w-full text-left">
               <thead>
                 <tr className="border-b border-slate-100">
                   <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Item</th>
                   <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Orçado</th>
                   <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Faturado</th>
                   <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Diferença</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {comparison.differences?.map((d, i) => (
                   <tr key={i} className={d.status === 'mismatch' ? 'bg-red-50' : ''}>
                     <td className="py-4 font-bold text-slate-700">{d.itemName}</td>
                     <td className="py-4 text-right font-mono text-slate-500">{d.currency} {d.quoteValue.toFixed(2)}</td>
                     <td className="py-4 text-right font-mono text-slate-500">{d.currency} {d.invoiceValue.toFixed(2)}</td>
                     <td className={`py-4 text-right font-black ${d.status === 'mismatch' ? 'text-red-500' : 'text-green-500'}`}>
                        {(d.invoiceValue - d.quoteValue).toFixed(2)}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      )}
    </div>
  );
}
