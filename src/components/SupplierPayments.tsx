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
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
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
      percentage: Number(m.percentage || 0)
    })) as Milestone[]
  });

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
      return {
        id: Math.random().toString(36).substring(2, 9),
        description: idx === 0 ? "Advance" : `Parcela ${idx + 1}`,
        percentage: pct,
        amount: (form.contractTotal * pct) / 100,
        isPaid: false,
        date: d.toISOString().split('T')[0]
      };
    });
    setForm(prev => ({ ...prev, milestones: newMilestones }));
    toast.success("Parcelas calculadas!");
  };

  useEffect(() => {
    if (!form.exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => setForm(prev => ({ ...prev, exchangeRate: parseFloat(json.USDBRL.bid) })))
        .catch(() => {});
    }
  }, []);

  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [showMsg, setShowMsg] = useState(false);
  const [whatsappText, setWhatsappText] = useState("");

  const addMilestone = () => {
    const newM: Milestone = { id: Math.random().toString(36).substring(2, 9), description: "Nova Parcela", percentage: 0, amount: 0, isPaid: false, date: new Date().toISOString().split('T')[0] };
    setForm(prev => ({ ...prev, milestones: [...prev.milestones, newM] }));
  };

  const removeMilestone = (id: string) => { setForm(prev => ({ ...prev, milestones: prev.milestones.filter(m => m.id !== id) })); };
  const updateMilestone = (id: string, updates: Partial<Milestone>) => { setForm(prev => ({ ...prev, milestones: prev.milestones.map(m => m.id === id ? { ...m, ...updates } : m) })); };

  const totalPaid = form.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = form.contractTotal - totalPaid;

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
        toast.success("Cloud OK!");
      }
    } catch (e) { toast.error("Erro ao salvar."); } finally { setLoading(false); }
  };

  const deleteHistoryRecord = (id: string) => {
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
    toast.success("Removido!");
  };

  const loadFromHistory = (h: any) => { setForm({ ...h.data }); toast.info(`Carregado: ${h.data.ciNumber}`); };

  const exportToPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text("GESTÃO DE PAGAMENTO", 20, 25);
    doc.setFontSize(9); doc.text(`REF: ${form.ciNumber} | ${new Date().toLocaleDateString()}`, 20, 32);
    const tableData = form.milestones.map(m => [new Date(m.date + 'T12:00:00').toLocaleDateString(), m.description, `${form.currency} ${m.amount.toLocaleString('pt-BR')}`, m.isPaid ? "PAGO" : "PENDENTE"]);
    doc.autoTable({ startY: 85, head: [['Data', 'Descricao', 'Valor', 'Status']], body: tableData, theme: 'grid' });
    doc.save(`Gestao_${form.ciNumber}.pdf`);
  };

  const shareWhatsApp = () => {
    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(form.ciNumber) || "S_Ref";
    
    // Compactar dados bancários (primeiras 3 linhas ou 120 caracteres)
    const bankLines = form.bankDetails.split('\n').filter(l => l.trim());
    const compactBank = bankLines.slice(0, 4).join(' | ');
    
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Segue formalização de câmbio:\n\n📄 *DADOS:* ${form.ciNumber} | ${form.productName}\n🚢 *EMBARQUE:* ${shipmentDate}\n\n💰 *FINANCEIRO:*` + "```" + `\nTOTAL: ${form.currency} ${form.contractTotal.toLocaleString('pt-BR')}\nPENDENTE: ${form.currency} ${balanceDue.toLocaleString('pt-BR')}\n` + "```" + `\n\n`;
    
    if (form.milestones.length > 0) {
      text += `📅 *PARCELAS:*` + "```" + `\n` + form.milestones.map(m => {
        const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').substring(0, 5);
        const val = m.amount.toLocaleString('pt-BR').padStart(10, ' ');
        return `${dt} | ${val} | ${m.isPaid ? '✓' : '✗'}`;
      }).join('\n') + "```" + `\n\n`;
    }
    
    text += `🏦 *BANCO:* ${compactBank.substring(0, 180)}...\n\nObrigado! 🤝\n#Pg_${refTag}`;
    setWhatsappText(text); setShowMsg(true);
  };

  const onDropProduct = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setForm(prev => ({ ...prev, productImage: r.result as string })); r.readAsDataURL(f[0]); }, []);
  const onDropBank = useCallback(async (f: File[]) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setForm(prev => ({ ...prev, bankImage: b })); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setForm(prev => ({ ...prev, bankDetails: ex.bankDetails })); toast.success("IA: Extraído!"); } catch (e) { toast.error("IA falhou."); } finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, []);
  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl"><DollarSign className="text-emerald-400" size={28} /></div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Audit & Cloud Sync</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 flex items-center gap-2"><Save size={18}/> Salvar</button>
          <button onClick={exportToPDF} className="px-6 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-50 flex items-center gap-2 shadow-sm"><Download size={18}/> PDF</button>
          <button onClick={shareWhatsApp} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 flex items-center gap-2"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={14} className="text-blue-500" /> Invoice</h3>
              <div {...getBankRoot()} className="w-full h-32 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer overflow-hidden group"><input {...getBankInput()} />{form.bankImage ? <img src={form.bankImage} className="w-full h-full object-cover" /> : <div className="text-center"><FileDown className="mx-auto text-slate-300 mb-2" size={24}/><p className="text-[9px] font-black text-slate-400 uppercase">Arraste</p></div>}</div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={14} className="text-emerald-500" /> Foto</h3>
              <div {...getProductRoot()} className="w-full h-32 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer overflow-hidden group"><input {...getProductInput()} />{form.productImage ? <img src={form.productImage} className="w-full h-full object-cover" /> : <div className="text-center"><Zap className="mx-auto text-slate-300 mb-2" size={24}/><p className="text-[9px] font-black text-slate-400 uppercase">Snap</p></div>}</div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Contrato</h2><div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 shadow-sm border border-emerald-100"><Ship size={14} /> ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Fornecedor</label><input type="text" value={form.supplierName} onChange={(e) => setForm(prev => ({ ...prev, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Data Pedido</label><input type="date" value={form.orderDate} onChange={(e) => setForm(prev => ({ ...prev, orderDate: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Lead Time</label><input type="number" value={form.productionDays} onChange={(e) => setForm(prev => ({ ...prev, productionDays: Number(e.target.value) }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Ref. CI</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(prev => ({ ...prev, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Container</label><input type="text" value={form.containerNumber} onChange={(e) => setForm(prev => ({ ...prev, containerNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                </div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total ({form.currency})</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(prev => ({ ...prev, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono-technical border-none" /></div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4"><div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Pagamento (Ex: 30/70)</label><input type="text" value={form.paymentTerms} onChange={(e) => setForm(prev => ({ ...prev, paymentTerms: e.target.value }))} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none" /></div><button onClick={applyPaymentTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase"><RefreshCw size={16}/></button></div>
            <div className="pt-6 border-t border-slate-100"><h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Landmark size={16} /> Beneficiary Data</h2><textarea value={form.bankDetails} onChange={(e) => setForm(prev => ({ ...prev, bankDetails: e.target.value }))} className="w-full h-24 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-600 border-none resize-none font-mono" placeholder="Cole os dados aqui..." /></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Parcelas</h2><button onClick={addMilestone} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-100">+ Add</button></div><div className="space-y-3">{form.milestones.map((m: Milestone) => (<div key={m.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-300 transition-all"><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Fase</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Data</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Valor</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-mono-technical font-black" /></div><div className="flex gap-2"><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PEND'}</button><button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 transition-all"><Trash2 size={16}/></button></div></div></div>))}</div></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="calculation-box p-8 shadow-xl shadow-emerald-100 border border-green-200/50"><h3 className="text-[11px] font-black uppercase text-green-900 border-b border-green-200/50 pb-4 flex items-center gap-2"><Calculator size={18} /> Auditoria</h3><div className="space-y-6"><div className="p-6 bg-white/40 rounded-[32px] border border-green-200/50"><p className="text-[9px] opacity-60 uppercase font-black mb-1">Câmbio R$ {form.exchangeRate.toFixed(4)}</p><p className="text-xl font-black text-green-900 font-mono-technical">R$ {(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}</p><p className="text-[10px] opacity-60 uppercase font-black mt-4 mb-1">Saldo em Aberto</p><p className="text-2xl font-black text-green-900 font-mono-technical">{form.currency} {balanceDue.toLocaleString('pt-BR')}</p></div><div className="w-full h-3 bg-white/50 rounded-full overflow-hidden p-0.5"><div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${(totalPaid / (form.contractTotal || 1)) * 100}%` }}></div></div></div></div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm"><h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={16} className="text-blue-500" /> Histórico</h3><div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">{history.map((h: any) => (<div key={h.id} onClick={() => loadFromHistory(h)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-400 hover:bg-white transition-all group relative cursor-pointer"><button onClick={(e) => { e.stopPropagation(); deleteHistoryRecord(h.id); }} className="absolute top-2 right-2 w-6 h-6 bg-red-50 text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={12}/></button><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "S/ REF"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p><p className="text-[11px] font-mono-technical font-black text-blue-600 mt-1">{h.data?.currency} {Number(h.data?.contractTotal || 0).toLocaleString('pt-BR')}</p></div>))}</div></div>
        </div>
      </div>

      {/* WHATSAPP MODAL */}
      {showMsg && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"><div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-500"><div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">WhatsApp <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div><div className="p-8 bg-slate-50"><textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[400px] p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none" /><div className="flex gap-4 mt-6"><button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado!"); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-slate-800 transition-all">Copiar</button><a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-emerald-700 transition-all text-center">Enviar</a></div></div></div></div>)}
    </div>
  );
}
