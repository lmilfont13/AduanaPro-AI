import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Plus, 
  Trash2, 
  Upload, 
  FileText, 
  CheckCircle, 
  Clock, 
  FileDown,
  DollarSign,
  Calendar,
  MessageSquare,
  Save,
  FolderOpen,
  Cloud,
  CloudOff,
  CloudUpload,
  RefreshCw,
  Calculator,
  FileSearch,
  Building2,
  Globe,
  User,
  Zap,
  TrendingUp,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { parsePaymentReceiptWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { supabase, IS_SUPABASE_CONFIGURED } from '../lib/supabase';
import { toast } from 'sonner';

interface Milestone {
  id: string;
  description: string;
  percentage: number;
  amount: number;
  isPaid: boolean;
  date: string;
}

export default function SupplierPayments({ data, onUpdate }: any) {
  const [loading, setLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(data?.exchangeRate || 0);
  const [productName, setProductName] = useState(data?.productName || "");
  const [bankDetails, setBankDetails] = useState(data?.bankDetails || "");
  const [recipientName, setRecipientName] = useState(data?.recipientName || "Eveline");
  const [orderDate, setOrderDate] = useState<string>(data?.orderDate || new Date().toISOString().split('T')[0]);
  const [productionDays, setProductionDays] = useState<number>(data?.productionDays || 30);
  const [bankImage, setBankImage] = useState<string | null>(data?.bankImage || null);
  const [productImage, setProductImage] = useState<string | null>(data?.productImage || null);
  const [showMsg, setShowMsg] = useState(false);
  const [whatsappText, setWhatsappText] = useState("");
  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const safeData = useMemo(() => ({
    supplierName: data?.supplierName || "FORNECEDOR N/I",
    ciNumber: data?.ciNumber || "N/E",
    contractTotal: Number(data?.contractTotal) || 0,
    currency: data?.currency || "USD",
    milestones: Array.isArray(data?.milestones) ? data.milestones.map((m: any) => ({
      ...m,
      id: m.id || Math.random().toString(36).substring(2, 9),
      date: m.date || new Date().toISOString().split('T')[0],
      amount: Number(m.amount || 0),
      percentage: Number(m.percentage || 0)
    })) : [],
    containerNumber: data?.containerNumber || "N/E",
    exchangeRate: exchangeRate || 0,
    productName: productName || data?.productName || "",
    bankDetails: bankDetails || data?.bankDetails || "",
    recipientName: recipientName || "Eveline",
    orderDate,
    productionDays,
    productImage,
    bankImage
  }), [data, exchangeRate, productName, bankDetails, recipientName, orderDate, productionDays, productImage, bankImage]);

  useEffect(() => {
    if (onUpdate && safeData) onUpdate(safeData);
  }, [safeData]);

  useEffect(() => {
    if (!exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => setExchangeRate(parseFloat(json.USDBRL.bid)))
        .catch(() => {});
    }
  }, []);

  const addMilestone = () => {
    const newMilestone: Milestone = {
      id: Math.random().toString(36).substring(2, 9),
      description: "Nova Parcela",
      percentage: 0,
      amount: 0,
      isPaid: false,
      date: new Date().toISOString().split('T')[0]
    };
    onUpdate({ ...safeData, milestones: [...safeData.milestones, newMilestone] });
  };

  const removeMilestone = (id: string) => {
    onUpdate({ ...safeData, milestones: safeData.milestones.filter((m: Milestone) => m.id !== id) });
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    onUpdate({
      ...safeData,
      milestones: safeData.milestones.map((m: Milestone) => m.id === id ? { ...m, ...updates } : m)
    });
  };

  const totalPaid = safeData.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = safeData.contractTotal - totalPaid;

  const saveRecord = async () => {
    setLoading(true);
    const recordId = safeData.ciNumber !== "N/E" ? safeData.ciNumber : `REC_${Date.now()}`;
    const dataToSave = { ...safeData, updatedAt: new Date().toISOString() };
    try {
      const newHistory = [ { id: recordId, dateSaved: new Date().toISOString(), data: dataToSave }, ...history.filter(h => h.id !== recordId) ];
      setHistory(newHistory);
      localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
      if (IS_SUPABASE_CONFIGURED) {
        await supabase.from('supplier_payments').upsert({ id: recordId, supplier_name: safeData.supplierName, ci_number: safeData.ciNumber, contract_total: safeData.contractTotal, data: dataToSave, updated_at: new Date().toISOString() });
        toast.success("Sincronizado na Nuvem!");
      }
    } catch (e) { toast.error("Erro ao salvar."); } finally { setLoading(false); }
  };

  const shareWhatsApp = () => {
    const etdDate = (() => {
      const d = new Date(orderDate + 'T12:00:00');
      d.setDate(d.getDate() + (Number(productionDays) || 0) + 10);
      return isNaN(d.getTime()) ? "N/E" : d.toLocaleDateString('pt-BR');
    })();
    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(safeData.ciNumber) || "Naoespecificado";
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${safeData.supplierName}\n\n${recipientName}, bom dia! 🏦 Gostaria de formalizar o pedido de lançamento de câmbio:\n\n📄 *DADOS DO PEDIDO:*\n• Ref: ${safeData.ciNumber}\n• Container: ${safeData.containerNumber}\n• Produto: ${safeData.productName}\n• Embarque: *${etdDate}* 🚢\n\n💰 *RESUMO FINANCEIRO:*\n` + "```" + `\nCONTRATO: ${safeData.currency} ${safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nCÂMBIO:    R$ ${safeData.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}\nTOTAL BRL: R$ ${(safeData.contractTotal * safeData.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` + "```" + `\n\n`;
    if (safeData.milestones.length > 0) {
      text += `📅 *PARCELAS:*\n` + "```" + `\n| DATA       | VALOR (${safeData.currency}) | %  |\n|------------|----------------|----|\n` + safeData.milestones.map(m => {
        const pct = ((m.amount / (safeData.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ');
        const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').padEnd(10);
        const val = m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14, ' ');
        return `| ${dt} | ${val} | ${pct}% |`;
      }).join('\n') + `\n` + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:*\n${bankDetails.substring(0, 150)}...\n\nFico no aguardo, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    setWhatsappText(text); setShowMsg(true);
  };

  const onDropProduct = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setProductImage(r.result as string); r.readAsDataURL(f[0]); }, []);
  const onDropBank = useCallback(async (f: File[]) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setBankImage(b); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setBankDetails(ex.bankDetails); toast.success("IA: Dados bancários auditados!"); } catch (e) { toast.error("Falha na IA."); } finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, []);
  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200"><DollarSign className="text-white" size={24} /></div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Financial Management</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Audit & Payment Workflow</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={saveRecord} className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center gap-2"><Save size={16}/> {loading ? "Salvando..." : "Salvar Cloud"}</button>
          <button onClick={shareWhatsApp} className="px-8 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200 flex items-center gap-2"><MessageSquare size={16}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
            <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-8">Dados Operacionais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Fornecedor</label><div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData.supplierName}</div></div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Produto</label><input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full p-5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all uppercase" /></div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Ref. Pedido</label><div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData.ciNumber}</div></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Container</label><div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData.containerNumber}</div></div>
                </div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Eveline (Responsável)</label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="w-full p-5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all" /></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">Gestão de Parcelas</h2>
              <button onClick={addMilestone} className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 text-[10px] font-black uppercase"><Plus size={14}/> Add Parcela</button>
            </div>
            <div className="space-y-4">
              {safeData.milestones.map((m: Milestone) => (
                <div key={m.id} className="flex flex-col md:flex-row gap-4 p-6 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-blue-300 transition-all group">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div><label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">Descrição</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-[10px] font-bold uppercase" /></div>
                    <div><label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">Vencimento</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-[10px] font-bold" /></div>
                    <div><label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">Valor ({safeData.currency})</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value), percentage: (Number(e.target.value) / safeData.contractTotal) * 100 })} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-[10px] font-mono-technical font-bold" /></div>
                    <div><label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">Status</label><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`w-full p-3 rounded-xl text-[9px] font-black uppercase transition-all ${m.isPaid ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'Pago' : 'Pendente'}</button></div>
                  </div>
                  <button onClick={() => removeMilestone(m.id)} className="p-3 text-slate-300 hover:text-red-500 transition-colors self-end"><Trash2 size={18}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="calculation-box shadow-2xl shadow-emerald-200/50">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-8 border-b border-green-200/50 pb-4 flex items-center gap-2"><ShieldCheck size={18} /> Financial Audit</h3>
            <div className="space-y-6">
              <div className="space-y-2"><p className="text-[9px] opacity-60 uppercase font-black">Contrato Total</p><p className="text-3xl font-black tracking-tighter">{safeData.currency} {safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
              <div className="p-4 bg-white/40 rounded-2xl border border-green-200/50"><p className="text-[9px] opacity-60 uppercase font-black mb-1">Conversão BRL (R$ {exchangeRate.toFixed(4)})</p><p className="text-sm font-black text-green-900 font-mono-technical">R$ {(safeData.contractTotal * exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
              <div className="pt-4 border-t border-green-200/50 space-y-3">
                <div className="flex justify-between text-[11px] font-bold opacity-70 uppercase font-black"><span>Liquidado:</span><span>{safeData.currency} {totalPaid.toLocaleString('pt-BR')}</span></div>
                <div className="flex justify-between text-xl font-black text-green-900 uppercase font-black"><span>Saldo:</span><span>{safeData.currency} {balanceDue.toLocaleString('pt-BR')}</span></div>
                <div className="w-full h-3 bg-white/50 rounded-full overflow-hidden p-0.5 mt-4"><div className="h-full bg-green-600 rounded-full transition-all duration-500" style={{ width: `${(totalPaid / (safeData.contractTotal || 1)) * 100}%` }}></div></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Evidências Digitais</h3>
            <div className="space-y-6">
              <div {...getProductRoot()} className="group relative aspect-video rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer overflow-hidden hover:border-emerald-400 transition-all">
                <input {...getProductInput()} />
                {productImage ? <img src={productImage} className="w-full h-full object-cover" alt="Product" /> : <div className="text-center"><Zap className="mx-auto text-slate-300 mb-2" size={32}/><p className="text-[8px] font-black text-slate-400 uppercase">Foto do Produto</p></div>}
              </div>
              <div {...getBankRoot()} className="group relative p-6 rounded-3xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-emerald-400 transition-all cursor-pointer">
                <input {...getBankInput()} />
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-400 group-hover:text-emerald-500 transition-colors"><Building2 size={24} /></div>
                  <div className="flex-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bank Details</p><p className="text-[10px] font-bold text-slate-700 truncate">{bankImage ? "DOC CARREGADO" : "Arraste a Invoice"}</p></div>
                  <ArrowRight size={16} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              <textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} className="w-full h-32 p-5 bg-slate-50 rounded-3xl text-[10px] font-bold text-slate-600 border-none resize-none focus:bg-white transition-all shadow-inner" placeholder="Dados bancários..." />
            </div>
          </div>

          <div className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><FolderOpen size={16} className="text-blue-500"/> Histórico Local</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {history.map((h: any) => h.data.supplierName === safeData.supplierName && (
                <div key={h.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-300 transition-all cursor-pointer">
                  <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-black text-slate-800 uppercase">{h.data.ciNumber}</span><span className="text-[8px] font-bold text-slate-400">{new Date(h.dateSaved).toLocaleDateString()}</span></div>
                  <p className="text-[11px] font-mono-technical font-bold text-blue-600 uppercase">USD {h.data.contractTotal.toLocaleString('pt-BR')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[56px] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-500 border border-white/20">
            <div className="bg-emerald-600 p-10 text-white relative">
              <div className="flex justify-between items-center relative">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-white/20 rounded-[24px] flex items-center justify-center backdrop-blur-xl"><Zap size={32} /></div>
                  <div><h3 className="text-2xl font-black uppercase tracking-tight leading-none">Smart Message</h3><p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.3em] mt-2">Monospace technical rendering</p></div>
                </div>
                <button onClick={() => setShowMsg(false)} className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all text-2xl font-light">×</button>
              </div>
            </div>
            <div className="p-10 bg-slate-50">
              <textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-96 p-8 bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed rounded-[32px] border-none outline-none resize-none shadow-2xl custom-scrollbar" />
              <div className="flex gap-4 mt-8">
                <button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado!"); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl"><FileText size={18} /> Copiar</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-200"><MessageSquare size={18} /> Enviar</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
