import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Square,
  Eraser,
  Globe2,
  FileCheck,
  PenTool,
  ChevronRight,
  Activity
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
  
  const companyLogo = useMemo(() => {
    try { return localStorage.getItem('ADUANAPRO_COMPANY_LOGO'); } catch(e) { return null; }
  }, []);

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

  const lastSentForm = useRef("");
  useEffect(() => {
    const formStr = JSON.stringify(form);
    if (formStr !== lastSentForm.current) {
      const timer = setTimeout(() => { if (onUpdate) onUpdate(form); lastSentForm.current = formStr; }, 1000);
      return () => clearTimeout(timer);
    }
  }, [form]);

  useEffect(() => {
    if (!form.exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(res => res.json()).then(json => setForm(prev => ({ ...prev, exchangeRate: parseFloat(json.USDBRL.bid) }))).catch(() => {});
    }
  }, []);

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setForm(prev => ({ ...prev, milestones: prev.milestones.map(m => m.id === id ? { ...m, ...updates } : m) }));
  };

  const applyPaymentTerms = () => {
    const parts = form.paymentTerms.split('/').map(p => parseFloat(p));
    const newMilestones: Milestone[] = parts.map((pct, idx) => {
      const d = new Date(form.orderDate + 'T12:00:00');
      if (idx > 0) d.setDate(d.getDate() + (form.productionDays));
      return { id: Math.random().toString(36).substring(2, 9), description: idx === 0 ? "Advance" : `Balance Production`, percentage: pct, amount: (form.contractTotal * pct) / 100, isPaid: false, date: d.toISOString().split('T')[0] };
    });
    setForm(prev => ({ ...prev, milestones: newMilestones }));
  };

  const saveRecord = async () => {
    setLoading(true);
    const recordId = form.ciNumber !== "N/E" ? form.ciNumber : `REC_${Date.now()}`;
    const dataToSave = { ...form, updatedAt: new Date().toISOString() };
    try {
      const newHistory = [ { id: recordId, dateSaved: new Date().toISOString(), data: dataToSave }, ...history.filter(h => h.id !== recordId) ];
      setHistory(newHistory);
      localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
      toast.success("Audit Salvo!");
    } catch (e) { toast.error("Erro."); } finally { setLoading(false); }
  };

  const nextPaymentsPerProject = useMemo(() => {
    if (!Array.isArray(history) || selectedIds.length === 0) return [];
    return history.filter(h => selectedIds.includes(h.id)).map(r => {
      const ms = r.data?.milestones || [];
      const pendings = ms.filter((m: any) => !m.isPaid).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return pendings.length > 0 ? { ...pendings[0], supplier: r.data?.supplierName || "N/I", ref: r.data?.ciNumber || "N/E", parentTotal: Number(r.data?.contractTotal || 0) } : null;
    }).filter(Boolean).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedIds, history]);

  const exportNextPaymentsPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.text("NEXT PAYMENTS AUDIT", 20, 25);
    const tableData = nextPaymentsPerProject.map((p: any) => [new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR'), (p.supplier||"").toUpperCase(), p.ref, (p.description||"").toUpperCase(), `$ ${Number(p.amount||0).toLocaleString('pt-BR')}`]);
    autoTable(doc, { startY: 50, head: [['DUE DATE', 'SUPPLIER', 'REFERENCE', 'PHASE', 'VALUE USD']], body: tableData });
    doc.save("Next_Obligations.pdf");
  };

  const exportSupplierPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    if (companyLogo) { try { doc.addImage(companyLogo, 'PNG', pageWidth/2 - 15, 10, 30, 15); } catch (e) {} }
    doc.setTextColor(15, 23, 42); doc.setFontSize(22); doc.text("Payment Status Report", pageWidth/2, 40, { align: 'center' });
    if (form.productImage) { try { doc.addImage(form.productImage, 'JPEG', pageWidth - 70, 60, 50, 50); } catch (e) {} }
    doc.setFontSize(11); doc.text((form.supplierName || "").toUpperCase(), 20, 65);
    const tableData = form.milestones.map(m => [new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR'), m.description, m.isPaid ? 'PAID' : 'DUE', `$ ${Number(m.amount || 0).toLocaleString('en-US')}`]);
    autoTable(doc, { startY: 130, head: [['DATE', 'PHASE', 'STATUS', 'USD']], body: tableData });
    doc.save(`Status_${form.ciNumber}.pdf`);
  };

  // HOOKS DE UPLOAD (CHAMADOS NO TOPO)
  const { getRootProps: gLogo, getInputProps: iLogo } = useDropzone({ onDrop: (f) => { const r = new FileReader(); r.onload = () => { const b = r.result as string; localStorage.setItem('ADUANAPRO_COMPANY_LOGO', b); window.location.reload(); }; r.readAsDataURL(f[0]); }, accept: {'image/*': []}, multiple: false });
  const { getRootProps: gProd, getInputProps: iProd } = useDropzone({ onDrop: (f) => { const r = new FileReader(); r.onload = () => setForm(p => ({ ...p, productImage: r.result as string })); r.readAsDataURL(f[0]); }, accept: {'image/*': []}, multiple: false });
  const { getRootProps: gBank, getInputProps: iBank } = useDropzone({ onDrop: async (f) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setForm(p => ({ ...p, bankImage: b })); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setForm(p => ({ ...prev, bankDetails: ex.bankDetails })); toast.success("IA OK!"); } catch (e) {} finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  const shipmentDate = useMemo(() => {
    const d = new Date(form.orderDate + 'T12:00:00');
    if (isNaN(d.getTime())) return "N/E";
    d.setDate(d.getDate() + (Number(form.productionDays) || 0) + 10);
    return d.toLocaleDateString('pt-BR');
  }, [form.orderDate, form.productionDays]);

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">
            {companyLogo ? <img src={companyLogo} className="w-10 h-10 object-contain" /> : <DollarSign className="text-emerald-400" size={28} />}
          </div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Audit Michelin Master</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2"><Save size={18}/> Salvar</button>
          <button onClick={exportSupplierPDF} className="px-6 py-4 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2"><FileCheck size={18}/> Status Report</button>
          <button onClick={() => {}} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-6 rounded-[32px] border border-blue-100 shadow-sm flex items-center gap-6">
            <div className="flex-1"><h3 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-1"><PenTool size={14} /> Sua Logo</h3><p className="text-[10px] text-slate-400 font-bold">Logo oficial para relatórios.</p></div>
            <div {...gLogo()} className="w-32 h-20 border-2 border-dashed border-blue-200 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden"><input {...iLogo()} />{companyLogo ? <img src={companyLogo} className="w-full h-full object-contain" /> : <Upload className="text-blue-300" size={20}/>}</div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center mb-2"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Audit Core</h2><div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase">ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Exportador</label><input type="text" value={form.supplierName} onChange={(e) => setForm(p => ({ ...p, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Ref CI</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(p => ({ ...p, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                <div {...gBank()} className="w-full h-24 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden"><input {...iBank()} />{form.bankImage ? <img src={form.bankImage} className="w-full h-full object-cover" /> : <FileDown className="text-slate-300" size={24}/>}</div>
              </div>
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total Contrato USD $</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(p => ({ ...p, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono shadow-inner border-none" /></div>
                <div className="pt-2"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2"><ImageIcon size={14} className="text-emerald-500" /> Foto Referência</h3><div {...gProd()} className="w-full h-40 border-2 border-dashed border-slate-200 rounded-[24px] flex items-center justify-center cursor-pointer overflow-hidden bg-slate-50"><input {...iProd()} />{form.productImage ? <img src={form.productImage} className="w-full h-full object-contain p-2" /> : <Zap className="text-slate-200" size={24}/>}</div></div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4"><div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Finalização (30/70)</label><input type="text" value={form.paymentTerms} onChange={(e) => setForm(p => ({ ...p, paymentTerms: e.target.value }))} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none outline-none" /></div><button onClick={applyPaymentTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl shadow-lg hover:bg-purple-700 transition-all"><RefreshCw size={16}/></button></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest mb-6">Milestones</h2><div className="space-y-4">{form.milestones.map((m: Milestone) => (<div key={m.id} className={`p-4 rounded-[28px] border transition-all ${m.date === todayStr ? 'bg-amber-50 border-amber-500 shadow-lg' : 'bg-slate-50 border-slate-100'}`}><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div><label className="text-[8px] font-black text-slate-400 uppercase">Fase</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase" /></div><div><label className="text-[8px] font-black text-slate-400 uppercase">Vencimento</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black" /></div><div><label className="text-[8px] font-black text-slate-400 uppercase">USD $</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black" /></div><div className="flex gap-2"><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PEND'}</button><button onClick={() => setForm(prev => ({ ...prev, milestones: prev.milestones.filter(x => x.id !== m.id) }))} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 transition-all"><Trash2 size={16}/></button></div></div></div>))}</div><button onClick={addMilestone} className="mt-6 w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase hover:border-blue-400 transition-all">+ Add Parcela</button></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="p-8 bg-slate-900 rounded-[40px] shadow-2xl text-white">
            <div className="flex justify-between items-center mb-6"><h3 className="text-[11px] font-black text-emerald-400 flex items-center gap-2 uppercase"><Activity size={18} /> Próximo Pagamento</h3>{nextPaymentsPerProject.length > 0 && (<button onClick={exportNextPaymentsPDF} className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg hover:scale-105 transition-all"><Download size={18}/></button>)}</div>
            <div className="space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
              {nextPaymentsPerProject.map((p: any, idx) => (<div key={idx} className="p-5 bg-slate-800/50 rounded-3xl border border-slate-700/50 relative group"><div className="flex justify-between items-start mb-2"><span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{p.ref}</span><span className={`text-[10px] font-black font-mono ${p.date === todayStr ? 'text-orange-400' : 'text-slate-400'}`}>{new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div><p className="text-[10px] font-bold text-slate-300 truncate mb-1">{p.supplier}</p><p className="text-[8px] text-slate-500 uppercase font-black mb-3">{p.description}</p><div className="flex justify-between items-center pt-3 border-t border-slate-700/50"><p className="text-xl font-black text-white font-mono">$ {Number(p.amount || 0).toLocaleString('pt-BR')}</p><span className="px-2 py-1 bg-slate-700 rounded-lg text-[9px] font-black text-slate-400">{((Number(p.amount||0)/Number(p.parentTotal||1))*100).toFixed(0)}%</span></div></div>))}
              {selectedIds.length === 0 && <div className="text-center py-12 opacity-30"><AlertCircle className="mx-auto mb-2" size={32} /><p className="text-[9px] font-black uppercase tracking-widest">Selecione no histórico</p></div>}
            </div>
            <div className="mt-8 pt-6 border-t border-slate-800"><p className="text-[9px] text-slate-500 uppercase font-black mb-1">Total Imediato</p><p className="text-3xl font-black text-emerald-400 font-mono tracking-tighter">$ {nextPaymentsPerProject.reduce((acc, p: any) => acc + Number(p.amount || 0), 0).toLocaleString('pt-BR')}</p></div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><History size={16} className="text-blue-500" /> Histórico Operacional</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {Array.isArray(history) && history.map((h: any) => (<div key={h.id} className="flex items-center gap-2 group"><div onClick={() => setSelectedIds(prev => prev.includes(h.id) ? prev.filter(id => id !== h.id) : [...prev, h.id])} className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all ${selectedIds.includes(h.id) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>{selectedIds.includes(h.id) ? <CheckSquare size={14}/> : <Square size={14}/>}</div><div onClick={() => setForm({ ...h.data })} className={`flex-1 p-4 rounded-2xl border transition-all cursor-pointer ${selectedIds.includes(h.id) ? 'bg-emerald-50 border-emerald-400' : 'bg-slate-50 border-slate-100 shadow-sm'}`}><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "N/A"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p></div><button onClick={() => setHistory(history.filter(x => x.id !== h.id))} className="w-8 h-8 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={14}/></button></div>))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
