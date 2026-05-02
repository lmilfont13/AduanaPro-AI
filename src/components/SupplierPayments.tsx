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
  RefreshCw,
  Calculator,
  Building2,
  Globe,
  User,
  Zap,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  X,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Landmark,
  Ship,
  Settings2,
  Download,
  BarChart3,
  AlertCircle,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  
  const getTodayLocal = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  };
  
  const todayStr = getTodayLocal();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [form, setForm] = useState({
    supplierName: data?.supplierName || "FORNECEDOR N/I",
    ciNumber: data?.ciNumber || "N/E",
    contractTotal: Number(data?.contractTotal) || 0,
    currency: data?.currency || "USD",
    containerNumber: data?.containerNumber || "N/E",
    exchangeRate: Number(data?.exchangeRate) || 0,
    productName: data?.productName || "",
    bankDetails: data?.bankDetails || "",
    recipientName: data?.recipientName || "Eveline",
    orderDate: data?.orderDate || new Date().toISOString().split('T')[0],
    productionDays: Number(data?.productionDays) || 30,
    paymentTerms: data?.paymentTerms || "30/70",
    productImage: data?.productImage || null as string | null,
    bankImage: data?.bankImage || null as string | null,
    milestones: (Array.isArray(data?.milestones) ? data.milestones : []).map((m: any) => ({
      ...m,
      id: m.id || Math.random().toString(36).substring(2, 9),
      amount: Number(m.amount || 0),
      percentage: Number(m.percentage || 0),
      isPaid: m.isPaid || false,
      date: m.date || new Date().toISOString().split('T')[0]
    })) as Milestone[]
  });

  const updateForm = (updates: any) => setForm(prev => ({ ...prev, ...updates }));

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setForm(prev => {
      const newMilestones = prev.milestones.map(m => m.id === id ? { ...m, ...updates } : m);
      return { ...prev, milestones: newMilestones };
    });
  };

  const addMilestone = () => {
    const newM: Milestone = { id: Math.random().toString(36).substring(2, 9), description: "Nova Parcela", percentage: 0, amount: 0, isPaid: false, date: todayStr };
    setForm(prev => ({ ...prev, milestones: [...prev.milestones, newM] }));
  };

  const removeMilestone = (id: string) => {
    setForm(prev => ({ ...prev, milestones: prev.milestones.filter(m => m.id !== id) }));
  };

  useEffect(() => { if (onUpdate) onUpdate(form); }, [form]);

  const shipmentDate = useMemo(() => {
    const d = new Date(form.orderDate + 'T12:00:00');
    if (isNaN(d.getTime())) return "N/E";
    d.setDate(d.getDate() + (Number(form.productionDays) || 0) + 10);
    return d.toLocaleDateString('pt-BR');
  }, [form.orderDate, form.productionDays]);

  const applyPaymentTerms = () => {
    const parts = form.paymentTerms.split('/').map(p => parseFloat(p));
    const newMilestones: Milestone[] = parts.map((pct, idx) => {
      const d = new Date(form.orderDate + 'T12:00:00');
      if (idx > 0) d.setDate(d.getDate() + (form.productionDays));
      return { id: Math.random().toString(36).substring(2, 9), description: idx === 0 ? "Advance" : `Milestone ${idx + 1}`, percentage: pct, amount: (form.contractTotal * pct) / 100, isPaid: false, date: d.toISOString().split('T')[0] };
    });
    setForm(prev => ({ ...prev, milestones: newMilestones }));
    toast.success("Cálculo Gerencial OK!");
  };

  useEffect(() => {
    if (!form.exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(res => res.json()).then(json => updateForm({ exchangeRate: parseFloat(json.USDBRL.bid) })).catch(() => {});
    }
  }, []);

  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const saveRecord = async () => {
    setLoading(true);
    const recordId = form.ciNumber !== "N/E" ? form.ciNumber : `REC_${Date.now()}`;
    const dataToSave = { ...form, updatedAt: new Date().toISOString() };
    try {
      const newHistory = [ { id: recordId, dateSaved: new Date().toISOString(), data: dataToSave }, ...history.filter(h => h.id !== recordId) ];
      setHistory(newHistory);
      localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
      if (IS_SUPABASE_CONFIGURED) {
        await supabase.from('supplier_payments').upsert({ id: recordId, supplier_name: form.supplierName, ci_number: form.ciNumber, contract_total: form.contractTotal, data: dataToSave, updated_at: new Date().toISOString() });
        toast.success("Audit Sincronizado!");
      }
    } catch (e) { toast.error("Erro no salvamento."); } finally { setLoading(false); }
  };

  const shareWhatsApp = () => {
    const milestonesToday = form.milestones.filter(m => m.date === todayStr && !m.isPaid);
    const hasToday = milestonesToday.length > 0;
    let header = hasToday ? `🔴🔴🔴🔴🔴🔴🔴\n🚨 *PAGAMENTO PARA HOJE* 🚨\n🔴🔴🔴🔴🔴🔴🔴` : `💼 *SOLICITAÇÃO DE PAGAMENTO*`;
    let urgency = "";
    if (hasToday) {
      urgency = `💸 *PAGAR IMEDIATAMENTE:*` + "```" + `\n` + milestonesToday.map(m => `${m.description.toUpperCase()} ($ ${m.amount.toLocaleString('pt-BR')})`).join('\n') + "```" + `\n\n`;
    }
    const bankLines = form.bankDetails.split('\n').filter(l => l.trim());
    const compactBank = bankLines.slice(0, 5).join(' | ');
    let text = `${header}\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Segue formalização:\n\n📄 *DADOS:* ${form.ciNumber}\n📦 *CONTAINER:* ${form.containerNumber}\n🚢 *EST. SHIPMENT:* ${shipmentDate}\n\n${urgency}💰 *QUADRO FINANCEIRO:*` + "```" + `\nTOTAL: $ ${form.contractTotal.toLocaleString('pt-BR')}\nTAXA: R$ ${form.exchangeRate.toFixed(4)}\nEST. BRL: R$ ${(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}\n` + "```" + `\n\n`;
    if (form.milestones.length > 0) {
      text += `📅 *PARCELAS:*` + "```" + `\n` + form.milestones.map(m => `${new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').substring(0, 5)} | $ ${m.amount.toLocaleString('pt-BR').padStart(10)} ${m.date === todayStr ? '⚠️' : (m.isPaid ? '✓' : ' ')}`).join('\n') + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:* ${compactBank.substring(0, 250)}...\n\n🤝 #Pg_${form.ciNumber}`;
    setWhatsappText(text); setShowMsg(true);
  };

  const totalPaid = form.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = form.contractTotal - totalPaid;

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200/50"><DollarSign className="text-emerald-400" size={28} /></div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Audit Control v2</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2"><Save size={18}/> Salvar</button>
          <button onClick={shareWhatsApp} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-xl shadow-emerald-200"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center mb-2"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Audit Core</h2><div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 shadow-sm border ${form.milestones.some(m => m.date === todayStr && !m.isPaid) ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}><Ship size={14} /> ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Exportador</label><input type="text" value={form.supplierName} onChange={(e) => updateForm({ supplierName: e.target.value })} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[9px] font-black text-slate-400 uppercase block">Data Pedido</label><input type="date" value={form.orderDate} onChange={(e) => updateForm({ orderDate: e.target.value })} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase block">Lead Time</label><input type="number" value={form.productionDays} onChange={(e) => updateForm({ productionDays: Number(e.target.value) })} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[9px] font-black text-slate-400 uppercase block">Audit CI#</label><input type="text" value={form.ciNumber} onChange={(e) => updateForm({ ciNumber: e.target.value })} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase block">Container#</label><input type="text" value={form.containerNumber} onChange={(e) => updateForm({ containerNumber: e.target.value })} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                  </div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total USD $</label><input type="number" value={form.contractTotal} onChange={(e) => updateForm({ contractTotal: Number(e.target.value) })} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono-technical border-none shadow-inner" /></div>
                </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4"><div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Preset de Pagamento (Ex: 30/70)</label><input type="text" value={form.paymentTerms} onChange={(e) => updateForm({ paymentTerms: e.target.value })} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none outline-none" placeholder="Ex: 30/70" /></div><button onClick={applyPaymentTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-purple-100"><RefreshCw size={16}/></button></div>
            <div className="pt-6 border-t border-slate-100"><h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Landmark size={16} /> Dados Bancários</h2><textarea value={form.bankDetails} onChange={(e) => updateForm({ bankDetails: e.target.value })} className="w-full h-24 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-600 border-none resize-none font-mono shadow-inner" placeholder="Dados para fechamento de câmbio..." /></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Cronograma Financeiro</h2><button onClick={addMilestone} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-100">+ Add</button></div><div className="space-y-4">{(form.milestones || []).map((m: Milestone) => (<div key={m.id} className={`p-4 rounded-[28px] border transition-all ${m.date === todayStr ? 'bg-amber-50 border-amber-500 shadow-lg ring-2 ring-amber-200' : 'bg-slate-50 border-slate-100'}`}><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Fase ({((m.amount/(form.contractTotal||1))*100).toFixed(0)}%)</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none focus:ring-1 ring-blue-400" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">{m.date === todayStr ? '🚨 VENCE HOJE' : 'Vencimento'}</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black outline-none focus:ring-1 ring-blue-400" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Valor USD $</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none focus:ring-1 ring-blue-400" /></div><div className="flex gap-2"><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PENDENTE'}</button><button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={16}/></button></div></div></div>))}</div></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
           <div className="p-8 bg-white rounded-[40px] shadow-sm border border-slate-100"><h3 className="text-[11px] font-black uppercase text-slate-800 mb-6 flex items-center gap-2"><Calculator size={18} className="text-emerald-500" /> Resumo Financeiro</h3><div className="space-y-6"><div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100"><p className="text-[9px] text-slate-400 uppercase font-black mb-1">Câmbio: R$ {form.exchangeRate.toFixed(4)}</p><p className="text-xl font-black text-slate-900 font-mono-technical">R$ {(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}</p><p className="text-[10px] text-slate-400 uppercase font-black mt-4 mb-1">Saldo Devedor</p><p className="text-2xl font-black text-red-600 font-mono-technical">$ {balanceDue.toLocaleString('pt-BR')}</p></div><div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${(totalPaid / (form.contractTotal || 1)) * 100}%` }}></div></div></div></div>
           <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm"><h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={16} className="text-blue-500" /> Histórico</h3><div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">{history.map((h: any) => (<div key={h.id} onClick={() => setForm({ ...h.data })} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-400 hover:bg-white transition-all group relative cursor-pointer"><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "N/A"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p><p className="text-[11px] font-mono-technical font-black text-blue-600 mt-1">$ {Number(h.data?.contractTotal || 0).toLocaleString('pt-BR')}</p></div>))}</div></div>
        </div>
      </div>

      {/* WHATSAPP MODAL */}
      {showMsg && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"><div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden"><div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">Executive Messenger <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div><div className="p-8 bg-slate-50"><textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[450px] p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none" /><div className="flex gap-4 mt-6"><button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado."); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase">Copy</button><a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase text-center">Send</a></div></div></div></div>)}
    </div>
  );
}
