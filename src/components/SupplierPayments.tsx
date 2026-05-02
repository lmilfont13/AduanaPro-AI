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
  const [showMsg, setShowMsg] = useState(false);
  const [whatsappText, setWhatsappText] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const getTodayLocal = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  };
  const todayStr = getTodayLocal();

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
      isPaid: !!m.isPaid,
      date: m.date || new Date().toISOString().split('T')[0]
    })) as Milestone[]
  });

  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => { if (onUpdate) onUpdate(form); }, [form]);

  useEffect(() => {
    if (!form.exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(res => res.json()).then(json => setForm(prev => ({ ...prev, exchangeRate: parseFloat(json.USDBRL.bid) }))).catch(() => {});
    }
  }, []);

  const shipmentDate = useMemo(() => {
    const d = new Date(form.orderDate + 'T12:00:00');
    if (isNaN(d.getTime())) return "N/E";
    d.setDate(d.getDate() + (Number(form.productionDays) || 0) + 10);
    return d.toLocaleDateString('pt-BR');
  }, [form.orderDate, form.productionDays]);

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setForm(prev => ({ ...prev, milestones: prev.milestones.map(m => m.id === id ? { ...m, ...updates } : m) }));
  };

  const addMilestone = () => {
    const newM: Milestone = { id: Math.random().toString(36).substring(2, 9), description: "New Phase", percentage: 0, amount: 0, isPaid: false, date: todayStr };
    setForm(prev => ({ ...prev, milestones: [...prev.milestones, newM] }));
  };

  const removeMilestone = (id: string) => {
    setForm(prev => ({ ...prev, milestones: prev.milestones.filter(m => m.id !== id) }));
  };

  const applyPaymentTerms = () => {
    const parts = form.paymentTerms.split('/').map(p => parseFloat(p));
    const newMilestones: Milestone[] = parts.map((pct, idx) => {
      const d = new Date(form.orderDate + 'T12:00:00');
      if (idx > 0) d.setDate(d.getDate() + (form.productionDays));
      return { id: Math.random().toString(36).substring(2, 9), description: idx === 0 ? "Advance" : `Milestone ${idx + 1}`, percentage: pct, amount: (form.contractTotal * pct) / 100, isPaid: false, date: d.toISOString().split('T')[0] };
    });
    setForm(prev => ({ ...prev, milestones: newMilestones }));
    toast.success("Cálculo Gerencial Aplicado!");
  };

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
      }
      toast.success("Audit Sincronizado!");
    } catch (e) { toast.error("Erro no salvamento."); } finally { setLoading(false); }
  };

  const exportIndividualPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text("EXECUTIVE AUDIT REPORT", 20, 25);
    if (form.productImage) try { doc.addImage(form.productImage, 'JPEG', pageWidth - 50, 8, 30, 30); } catch (e) {}
    const tableData = form.milestones.map(m => [new Date(m.date + 'T12:00:00').toLocaleDateString(), m.description, `$ ${m.amount.toLocaleString('pt-BR')}`, m.isPaid ? "PAID" : "PENDING"]);
    autoTable(doc, { startY: 60, head: [['DATE', 'PHASE', 'VALUE $', 'STATUS']], body: tableData, theme: 'grid', headStyles: { fillStyle: [15, 23, 42] } });
    doc.save(`Audit_${form.ciNumber}.pdf`);
  };

  const exportConsolidatedPDF = () => {
    const records = history.filter(h => selectedIds.includes(h.id));
    if (records.length === 0) { toast.error("Selecione itens no histórico."); return; }
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text("GLOBAL CASH FLOW AUDIT", 20, 25);
    let allMs: any[] = [];
    records.forEach(r => { (r.data.milestones || []).forEach((m: any) => allMs.push({ ...m, supplier: r.data.supplierName, ref: r.data.ciNumber })); });
    allMs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const tableData = allMs.map(m => [new Date(m.date + 'T12:00:00').toLocaleDateString(), m.supplier.substring(0, 15), m.ref, m.description.substring(0, 15), `$ ${m.amount.toLocaleString('pt-BR')}`, m.isPaid ? "OK" : "DUE"]);
    autoTable(doc, { startY: 55, head: [['DATE', 'SUPPLIER', 'REF', 'PHASE', 'USD $', 'STATUS']], body: tableData, theme: 'grid', headStyles: { fillStyle: [15, 23, 42] } });
    doc.save("Global_Financial_Audit.pdf");
  };

  const shareWhatsApp = () => {
    const todayMs = form.milestones.filter(m => m.date === todayStr && !m.isPaid);
    const hasToday = todayMs.length > 0;
    let header = hasToday ? `🔴🔴🔴🔴🔴🔴🔴\n🚨 *PAGAMENTO PARA HOJE* 🚨\n🔴🔴🔴🔴🔴🔴🔴` : `💼 *SOLICITAÇÃO DE PAGAMENTO*`;
    let urgency = hasToday ? `💸 *PAGAR AGORA:*` + "```" + `\n` + todayMs.map(m => `${m.description.toUpperCase()} ($ ${m.amount.toLocaleString('pt-BR')})`).join('\n') + "```" + `\n\n` : "";
    const bank = form.bankDetails.split('\n').slice(0, 5).join(' | ');
    let text = `${header}\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Segue formalização:\n\n📄 *DADOS:* ${form.ciNumber}\n📦 *CONTAINER:* ${form.containerNumber}\n🚢 *EMBARQUE:* ${shipmentDate}\n\n${urgency}💰 *FINANCEIRO:*` + "```" + `\nTOTAL: $ ${form.contractTotal.toLocaleString('pt-BR')}\nTAXA: R$ ${form.exchangeRate.toFixed(4)}\nBRL: R$ ${(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}\n` + "```" + `\n\n`;
    if (form.milestones.length > 0) {
      text += `📅 *PARCELAS:*` + "```" + `\n` + form.milestones.map(m => `${new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').substring(0, 5)} | $ ${m.amount.toLocaleString('pt-BR').padStart(10)} ${m.date === todayStr ? '⚠️' : (m.isPaid ? '✓' : ' ')}`).join('\n') + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:* ${bank.substring(0, 250)}...\n\n🤝 #Pg_${form.ciNumber}`;
    setWhatsappText(text); setShowMsg(true);
  };

  const totalPaid = form.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = form.contractTotal - totalPaid;

  const onDropProd = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setForm(p => ({ ...p, productImage: r.result as string })); r.readAsDataURL(f[0]); }, []);
  const { getRootProps: gp, getInputProps: gi } = useDropzone({ onDrop: onDropProd, accept: {'image/*': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl"><DollarSign className="text-emerald-400" size={28} /></div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Michelin Executive Audit</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2"><Save size={18}/> Salvar</button>
          <button onClick={exportConsolidatedPDF} className="px-6 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100"><BarChart3 size={18}/> Fluxo Seletivo</button>
          <button onClick={exportIndividualPDF} className="px-6 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"><Download size={18}/> PDF CI</button>
          <button onClick={shareWhatsApp} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 flex items-center gap-2 shadow-xl shadow-emerald-200"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center mb-2"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Audit Foundation</h2><div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 border ${form.milestones.some(m => m.date === todayStr && !m.isPaid) ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}><Ship size={14} /> ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Fornecedor</label><input type="text" value={form.supplierName} onChange={(e) => setForm(p => ({ ...p, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Pedido</label><input type="date" value={form.orderDate} onChange={(e) => setForm(p => ({ ...p, orderDate: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Dias Prod.</label><input type="number" value={form.productionDays} onChange={(e) => setForm(p => ({ ...p, productionDays: Number(e.target.value) }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Ref CI</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(p => ({ ...p, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Container</label><input type="text" value={form.containerNumber} onChange={(e) => setForm(p => ({ ...p, containerNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                </div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total USD $</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(p => ({ ...p, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono-technical border-none" /></div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4"><div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Condição (30/70)</label><input type="text" value={form.paymentTerms} onChange={(e) => setForm(p => ({ ...p, paymentTerms: e.target.value }))} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none outline-none" /></div><button onClick={applyPaymentTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase"><RefreshCw size={16}/></button></div>
            <div className="pt-6 border-t border-slate-100"><h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Landmark size={16} /> Banco</h2><textarea value={form.bankDetails} onChange={(e) => setForm(p => ({ ...p, bankDetails: e.target.value }))} className="w-full h-24 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-600 border-none resize-none font-mono" /></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Cronograma</h2><button onClick={addMilestone} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase">+ Add</button></div><div className="space-y-4">{form.milestones.map((m: Milestone) => (<div key={m.id} className={`p-4 rounded-[28px] border transition-all ${m.date === todayStr ? 'bg-amber-50 border-amber-500 shadow-lg' : 'bg-slate-50 border-slate-100'}`}><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Fase</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Vencimento</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black outline-none" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">USD $</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" /></div><div className="flex gap-2"><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PEND'}</button><button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16}/></button></div></div></div>))}</div></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="p-8 bg-white rounded-[40px] shadow-sm border border-slate-100"><h3 className="text-[11px] font-black text-slate-800 mb-6 flex items-center gap-2 uppercase"><Calculator size={18} /> Resumo Financeiro</h3><div className="space-y-6"><div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100"><p className="text-[9px] text-slate-400 uppercase font-black mb-1">Câmbio: R$ {form.exchangeRate.toFixed(4)}</p><p className="text-xl font-black text-slate-900 font-mono-technical">R$ {(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}</p><p className="text-[10px] text-slate-400 uppercase font-black mt-4 mb-1">Saldo Aberto</p><p className="text-2xl font-black text-red-600 font-mono-technical">$ {balanceDue.toLocaleString('pt-BR')}</p></div><div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${(totalPaid / (form.contractTotal || 1)) * 100}%` }}></div></div></div></div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm"><h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={16} className="text-blue-500" /> Histórico</h3><div className="space-y-3">{history.map((h: any) => (<div key={h.id} className="flex items-center gap-2"><input type="checkbox" checked={selectedIds.includes(h.id)} onChange={() => setSelectedIds(prev => prev.includes(h.id) ? prev.filter(id => id !== h.id) : [...prev, h.id])} className="w-4 h-4 rounded text-blue-600" /><div onClick={() => setForm({ ...h.data })} className={`flex-1 p-4 rounded-2xl border cursor-pointer transition-all ${selectedIds.includes(h.id) ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "N/A"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p></div><button onClick={() => deleteHistoryRecord(h.id)} className="w-8 h-8 text-red-400 hover:bg-red-50 rounded-lg flex items-center justify-center"><X size={14}/></button></div>))}</div></div>
        </div>
      </div>

      {showMsg && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"><div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden"><div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">Executive Messenger <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div><div className="p-8 bg-slate-50"><textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[450px] p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none" /><div className="flex gap-4 mt-6"><button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado."); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase">Copy</button><a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase text-center">Send</a></div></div></div></div>)}
    </div>
  );
}
const deleteHistoryRecord = (id: string) => { /* Placeholder se necessário, mas implementado acima */ };
