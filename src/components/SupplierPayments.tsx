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
  Square,
  Eraser,
  Globe2,
  FileCheck,
  PenTool,
  ListTodo,
  FileSpreadsheet
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
  
  const companyLogo = useMemo(() => localStorage.getItem('ADUANAPRO_COMPANY_LOGO'), []);

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

  // PERFORMANCE: Debounced Update
  useEffect(() => {
    const timer = setTimeout(() => { if (onUpdate) onUpdate(form); }, 500);
    return () => clearTimeout(timer);
  }, [form]);

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

  const applyPaymentTerms = () => {
    const parts = form.paymentTerms.split('/').map(p => parseFloat(p));
    const newMilestones: Milestone[] = parts.map((pct, idx) => {
      const d = new Date(form.orderDate + 'T12:00:00');
      if (idx > 0) d.setDate(d.getDate() + (form.productionDays));
      return { id: Math.random().toString(36).substring(2, 9), description: idx === 0 ? "Advance" : `Milestone ${idx + 1}`, percentage: pct, amount: (form.contractTotal * pct) / 100, isPaid: false, date: d.toISOString().split('T')[0] };
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

  const exportSupplierPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    if (companyLogo) { try { doc.addImage(companyLogo, 'PNG', pageWidth/2 - 15, 10, 30, 15); } catch (e) {} }
    doc.setTextColor(15, 23, 42); doc.setFontSize(22); doc.setFont(undefined, 'bold');
    doc.text("Payment Status Report", pageWidth/2, 40, { align: 'center' });
    doc.setTextColor(249, 115, 22); doc.setFontSize(9); doc.text("OFFICIAL ORDER VERIFICATION", pageWidth/2, 47, { align: 'center' });
    if (form.productImage) { try { doc.addImage(form.productImage, 'JPEG', pageWidth - margin - 35, 60, 35, 35); } catch (e) {} }
    doc.setTextColor(15, 23, 42); doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.text(form.supplierName.toUpperCase(), margin, 65);
    doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.text(`REF: ${form.ciNumber}`, margin, 71);
    doc.text("CONTRACT TOTAL", margin, 81);
    doc.setTextColor(15, 23, 42); doc.setFontSize(16); doc.text(`USD ${form.contractTotal.toLocaleString('en-US')}`, margin, 90);
    const totalPaid = form.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
    const balance = form.contractTotal - totalPaid;
    doc.setFillColor(240, 253, 244); doc.rect(margin, 105, 70, 35, 'F');
    doc.setTextColor(22, 101, 52); doc.setFontSize(7); doc.text("PAID AMOUNT", margin + 5, 112);
    doc.setFontSize(11); doc.text(`USD ${totalPaid.toLocaleString('en-US')}`, margin + 5, 125);
    doc.setFillColor(254, 242, 242); doc.rect(margin + 75, 105, 70, 35, 'F');
    doc.setTextColor(153, 27, 27); doc.text("REMAINING", margin + 80, 112);
    doc.setFontSize(11); doc.text(`USD ${balance.toLocaleString('en-US')}`, margin + 80, 125);
    const tableData = form.milestones.map(m => [
      { content: `${new Date(m.date + 'T12:00:00').toLocaleDateString('en-US')}\n${m.isPaid ? 'PAID' : 'DUE'}`, styles: { textColor: m.isPaid ? [22, 101, 52] : [148, 163, 184], fontSize: 7 } },
      m.description.toUpperCase(),
      ((m.amount/form.contractTotal)*100).toFixed(1)+'%',
      `USD ${m.amount.toLocaleString('en-US')}`
    ]);
    autoTable(doc, { startY: 150, head: [['DATE', 'DESCRIPTION', 'SHARE', 'USD']], body: tableData, theme: 'plain', styles: { fontSize: 8 } });
    doc.save(`Status_${form.ciNumber}.pdf`);
  };

  // PERFORMANCE: Optimized Pending Calculation
  const pendingObligations = useMemo(() => {
    if (selectedIds.length === 0) return [];
    let pendings: any[] = [];
    const selectedHistory = history.filter(h => selectedIds.includes(h.id));
    selectedHistory.forEach(r => {
      (r.data.milestones || []).filter((m: any) => !m.isPaid).forEach((m: any) => {
        pendings.push({ ...m, supplier: r.data.supplierName, ref: r.data.ciNumber, parentTotal: r.data.contractTotal });
      });
    });
    return pendings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedIds, history]);

  const exportPendingReport = () => {
    if (pendingObligations.length === 0) return;
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text("PENDING OBLIGATIONS AUDIT", 20, 20);
    doc.setFontSize(10); doc.text("CONSOLIDATED CASH FLOW FORECAST", 20, 30);
    
    // Group by Month
    const months: any = {};
    pendingObligations.forEach(p => {
      const monthKey = new Date(p.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
      if (!months[monthKey]) months[monthKey] = [];
      months[monthKey].push(p);
    });

    let currentY = 55;
    Object.keys(months).forEach(month => {
      doc.setTextColor(15, 23, 42); doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(month, 20, currentY);
      currentY += 5;
      const tableData = months[month].map((p: any) => [
        new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR'),
        p.supplier.substring(0, 20),
        p.ref,
        `${((p.amount / p.parentTotal) * 100).toFixed(1)}%`,
        `$ ${p.amount.toLocaleString('pt-BR')}`
      ]);
      autoTable(doc, { 
        startY: currentY, 
        head: [['DATE', 'SUPPLIER', 'REFERENCE', 'SHARE %', 'VALUE USD']], 
        body: tableData, 
        theme: 'grid', 
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8 }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    });

    const total = pendingObligations.reduce((acc, p) => acc + p.amount, 0);
    doc.setFillColor(249, 115, 22); doc.rect(20, currentY, pageWidth - 40, 25, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.text(`TOTAL OUTSTANDING: USD ${total.toLocaleString('pt-BR')}`, pageWidth/2, currentY + 16, { align: 'center' });
    doc.save("Pending_Audit.pdf");
  };

  const shareWhatsApp = () => {
    const todayMs = form.milestones.filter(m => m.date === todayStr && !m.isPaid);
    const hasToday = todayMs.length > 0;
    let urgency = hasToday ? `🚨 *URGENTE:* -------------------------> *PAGAR HOJE*\n` : "";
    if (hasToday) { todayMs.forEach(m => { urgency += `*${m.description.toUpperCase()} (${((m.amount/form.contractTotal)*100).toFixed(0)}%)*\nUSD $ ${m.amount.toLocaleString('pt-BR')} | BRL EST. R$ ${(m.amount * form.exchangeRate).toLocaleString('pt-BR')}\n`; }); urgency += `-----------------------------------------\n\n`; }
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Segue formalização:\n\n📄 *DADOS:* ${form.ciNumber}\n🚢 *EMBARQUE:* ${shipmentDate}\n\n${urgency}💰 *FINANCEIRO:*` + "```" + `\nTOTAL: $ ${form.contractTotal.toLocaleString('pt-BR')}\nTAXA: R$ ${form.exchangeRate.toFixed(4)}\nBRL: R$ ${(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}\n` + "```" + `\n\n`;
    if (form.milestones.length > 0) { text += `📅 *PARCELAS:*` + "```" + `\n` + form.milestones.map(m => `${new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').substring(0, 5)} | ${((m.amount/form.contractTotal)*100).toFixed(0).padStart(2)}% | $ ${m.amount.toLocaleString('pt-BR').padStart(10)}${m.date === todayStr ? ' <--- HOJE' : (m.isPaid ? ' ✓' : '  ')}`).join('\n') + "```" + `\n\n`; }
    text += `🤝 #Pg_${form.ciNumber}`;
    setWhatsappText(text); setShowMsg(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">
            {companyLogo ? <img src={companyLogo} className="w-10 h-10 object-contain rounded-lg" /> : <DollarSign className="text-emerald-400" size={28} />}
          </div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Audit & Optimization</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-xl"><Save size={18}/> Salvar</button>
          <button onClick={exportSupplierPDF} className="px-6 py-4 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg"><FileCheck size={18}/> Status Report (EN)</button>
          <button onClick={shareWhatsApp} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-xl shadow-emerald-200"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center mb-2"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Audit Core</h2><div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border ${form.milestones.some(m => m.date === todayStr && !m.isPaid) ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Exportador</label><input type="text" value={form.supplierName} onChange={(e) => setForm(p => ({ ...p, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Pedido</label><input type="date" value={form.orderDate} onChange={(e) => setForm(p => ({ ...p, orderDate: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Ref CI</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(p => ({ ...p, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                </div>
              </div>
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total USD $</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(p => ({ ...p, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono-technical" /></div>
                <div className="pt-2"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2"><ImageIcon size={14} className="text-emerald-500" /> Foto Produto</h3><div onClick={() => {}} {...useDropzone({ onDrop: (f) => { const r = new FileReader(); r.onload = () => setForm(p => ({ ...p, productImage: r.result as string })); r.readAsDataURL(f[0]); }, accept: {'image/*': []}, multiple: false }).getRootProps()} className="w-full h-24 border-2 border-dashed border-slate-200 rounded-[20px] flex flex-col items-center justify-center cursor-pointer overflow-hidden"><input {...useDropzone({ onDrop: () => {} }).getInputProps()} />{form.productImage ? <img src={form.productImage} className="w-full h-full object-cover" /> : <Zap className="text-slate-200" size={20}/>}</div></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest mb-6">Cronograma</h2><div className="space-y-4">{form.milestones.map((m: Milestone) => (<div key={m.id} className={`p-4 rounded-[28px] border transition-all ${m.date === todayStr ? 'bg-amber-50 border-amber-500 shadow-lg' : 'bg-slate-50 border-slate-100'}`}><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div><label className="text-[8px] font-black text-slate-400 uppercase">Fase</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none" /></div><div><label className="text-[8px] font-black text-slate-400 uppercase">Vencimento</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black outline-none" /></div><div><label className="text-[8px] font-black text-slate-400 uppercase">USD $</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" /></div><div className="flex gap-2"><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PEND'}</button><button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16}/></button></div></div></div>))}</div><button onClick={addMilestone} className="mt-6 w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase hover:border-blue-400 hover:text-blue-500 transition-all">+ Add Parcela</button></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="p-8 bg-slate-900 rounded-[40px] shadow-2xl text-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[11px] font-black text-emerald-400 flex items-center gap-2 uppercase"><ListTodo size={18} /> Obrigações Pendentes</h3>
              {pendingObligations.length > 0 && (
                <button onClick={exportPendingReport} className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"><FileSpreadsheet size={18}/></button>
              )}
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {pendingObligations.map((p, idx) => (
                <div key={idx} className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-black text-emerald-400 uppercase">{p.ref}</span>
                    <span className={`text-[10px] font-black font-mono ${p.date === todayStr ? 'text-orange-400' : 'text-slate-400'}`}>{new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-300 truncate mb-1">{p.supplier}</p>
                  <div className="flex justify-between items-end">
                    <p className="text-[12px] font-black text-white">$ {p.amount.toLocaleString('pt-BR')}</p>
                    <span className="text-[9px] font-black text-slate-500 uppercase">{((p.amount/p.parentTotal)*100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              {selectedIds.length === 0 && <p className="text-[10px] text-slate-600 italic text-center py-8">Selecione projetos para listar pendências</p>}
            </div>
            <div className="mt-6 pt-6 border-t border-slate-800">
                <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Total Faltante</p>
                <p className="text-2xl font-black text-emerald-400 font-mono-technical">$ {pendingObligations.reduce((acc, p) => acc + p.amount, 0).toLocaleString('pt-BR')}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><History size={16} className="text-blue-500" /> Histórico</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {history.map((h: any) => (<div key={h.id} className="flex items-center gap-2 group"><div onClick={() => setSelectedIds(prev => prev.includes(h.id) ? prev.filter(id => id !== h.id) : [...prev, h.id])} className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all ${selectedIds.includes(h.id) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>{selectedIds.includes(h.id) ? <CheckSquare size={14}/> : <Square size={14}/>}</div><div onClick={() => setForm({ ...h.data })} className={`flex-1 p-4 rounded-2xl border transition-all cursor-pointer ${selectedIds.includes(h.id) ? 'bg-emerald-50 border-emerald-400' : 'bg-slate-50 border-slate-100'}`}><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "N/A"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p></div><button onClick={() => setHistory(history.filter(x => x.id !== h.id))} className="w-8 h-8 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={14}/></button></div>))}
            </div>
          </div>
        </div>
      </div>

      {showMsg && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"><div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden"><div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">Executive Messenger <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div><div className="p-8 bg-slate-50"><textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[450px] p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none shadow-inner" /><div className="flex gap-4 mt-6"><button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado."); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase">Copy</button><a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase text-center">Send</a></div></div></div></div>)}
    </div>
  );
}
