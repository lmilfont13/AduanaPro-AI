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
  AlertCircle
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
  const todayStr = new Date().toISOString().split('T')[0];
  
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
        description: idx === 0 ? "Advance Payment" : `Milestone ${idx + 1}`,
        percentage: pct,
        amount: (form.contractTotal * pct) / 100,
        isPaid: false,
        date: d.toISOString().split('T')[0]
      };
    });
    setForm(prev => ({ ...prev, milestones: newMilestones }));
    toast.success("Cálculo Gerencial Aplicado!");
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
    const newM: Milestone = { id: Math.random().toString(36).substring(2, 9), description: "Manual Milestone", percentage: 0, amount: 0, isPaid: false, date: new Date().toISOString().split('T')[0] };
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
        toast.success("Cloud Audit Ready!");
      }
    } catch (e) { toast.error("Audit Save Failed."); } finally { setLoading(false); }
  };

  const deleteHistoryRecord = (id: string) => {
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
    toast.success("Record Deleted.");
  };

  const loadFromHistory = (h: any) => { setForm({ ...h.data }); toast.info(`Loaded Audit: ${h.data.ciNumber}`); };

  // EXPORT INDIVIDUAL PDF (MICHELIN LEVEL)
  const exportIndividualPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    
    // Luxury Header
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont("helvetica", "bold");
    doc.text("FINANCIAL MANAGEMENT REPORT", 20, 25);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`REFERENCE: ${form.ciNumber} | EMISSION: ${new Date().toLocaleString()}`, 20, 32);

    // Image Signature
    if (form.productImage) {
      try { doc.addImage(form.productImage, 'JPEG', pageWidth - 50, 8, 30, 30); } catch (e) {}
    }

    // Sections
    let currentY = 55;
    const drawSection = (title: string, y: number) => {
      doc.setFillColor(241, 245, 249); doc.rect(20, y, pageWidth - 40, 7, 'F');
      doc.setTextColor(51, 65, 85); doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text(title.toUpperCase(), 25, y + 5);
      return y + 12;
    };

    currentY = drawSection("Supplier Information", currentY);
    doc.setTextColor(15, 23, 42); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(`NAME: ${form.supplierName}`, 20, currentY);
    doc.setFont("helvetica", "normal"); doc.text(`PRODUCT: ${form.productName || "N/I"}`, 20, currentY + 6);
    doc.text(`CONTAINER: ${form.containerNumber}`, 20, currentY + 12);

    doc.setFont("helvetica", "bold"); doc.text("LOGISTICS", 120, currentY);
    doc.setFont("helvetica", "normal"); doc.text(`ORDER DATE: ${new Date(form.orderDate).toLocaleDateString()}`, 120, currentY + 6);
    doc.text(`EST. SHIPMENT: ${shipmentDate}`, 120, currentY + 12);

    currentY += 22;
    currentY = drawSection("Payment Schedule & Milestones", currentY);

    const tableData = form.milestones.map(m => [
      new Date(m.date + 'T12:00:00').toLocaleDateString(),
      m.description,
      `$ ${m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      m.isPaid ? "LIQUIDATED" : "PENDING"
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['DUE DATE', 'DESCRIPTION', 'AMOUNT (USD)', 'STATUS']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillStyle: [15, 23, 42], fontSize: 8 },
      styles: { fontSize: 8 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
    currentY = drawSection("Bank & Beneficiary Details", currentY);
    doc.setTextColor(51, 65, 85); doc.setFontSize(8); doc.setFont("courier", "normal");
    const bankLines = doc.splitTextToSize(form.bankDetails || "NO BANK DETAILS PROVIDED", pageWidth - 50);
    doc.text(bankLines, 20, currentY + 5);

    currentY += (bankLines.length * 4) + 10;
    doc.setFillColor(15, 23, 42); doc.rect(pageWidth - 90, currentY, 70, 25, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("BALANCE SUMMARY", pageWidth - 85, currentY + 8);
    doc.setFontSize(11);
    doc.text(`DUE: $ ${balanceDue.toLocaleString('pt-BR')}`, pageWidth - 85, currentY + 18);

    doc.save(`Audit_${form.ciNumber}.pdf`);
    toast.success("Executive Audit Generated!");
  };

  const exportConsolidatedPDF = () => {
    if (history.length === 0) { toast.error("Empty History!"); return; }
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.text("GLOBAL CASH FLOW AUDIT", 20, 25);
    
    let allMilestones: any[] = [];
    history.forEach(h => {
      const ms = Array.isArray(h.data?.milestones) ? h.data.milestones : [];
      ms.forEach((m: any) => { allMilestones.push({ ...m, supplier: h.data.supplierName, ref: h.data.ciNumber, image: h.data.productImage }); });
    });
    allMilestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tableData = allMilestones.map(m => [
      new Date(m.date + 'T12:00:00').toLocaleDateString(),
      m.supplier.substring(0, 15),
      m.ref,
      m.description.substring(0, 15),
      `$ ${m.amount.toLocaleString('pt-BR')}`,
      m.isPaid ? "OK" : "PEND"
    ]);

    autoTable(doc, { 
      startY: 50, 
      head: [['DATE', 'SUPPLIER', 'REF', 'PHASE', 'USD $', 'STATUS']], 
      body: tableData, 
      theme: 'grid',
      headStyles: { fillStyle: [15, 23, 42], fontSize: 7 },
      styles: { fontSize: 7 }
    });
    
    doc.save("Consolidated_Flow_Report.pdf");
  };

  const shareWhatsApp = () => {
    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(form.ciNumber) || "S_Ref";
    const bankLines = form.bankDetails.split('\n').filter(l => l.trim());
    const compactBank = bankLines.slice(0, 4).join(' | ');
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Segue formalização:\n\n📄 *DADOS:* ${form.ciNumber}\n📦 *CONTAINER:* ${form.containerNumber}\n🚢 *EMBARQUE:* ${shipmentDate}\n\n💰 *FINANCEIRO:*` + "```" + `\nTOTAL: $ ${form.contractTotal.toLocaleString('pt-BR')}\nTAXA:  R$ ${form.exchangeRate.toFixed(4)}\nEST. BRL: R$ ${(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}\n` + "```" + `\n\n`;
    if (form.milestones.length > 0) {
      text += `📅 *PARCELAS ($ | R$):*` + "```" + `\n` + form.milestones.map(m => {
        const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').substring(0, 5);
        const valUsd = `$ ${m.amount.toLocaleString('pt-BR')}`.padStart(10, ' ');
        const valBrl = `R$ ${(m.amount * form.exchangeRate).toLocaleString('pt-BR')}`.padStart(12, ' ');
        return `${dt} | ${valUsd} | ${valBrl}`;
      }).join('\n') + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:* ${compactBank.substring(0, 180)}...\n\n🤝 #Pg_${refTag}`;
    setWhatsappText(text); setShowMsg(true);
  };

  const onDropProduct = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setForm(prev => ({ ...prev, productImage: r.result as string })); r.readAsDataURL(f[0]); }, []);
  const onDropBank = useCallback(async (f: File[]) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setForm(prev => ({ ...prev, bankImage: b })); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setForm(prev => ({ ...prev, bankDetails: ex.bankDetails })); toast.success("AI: Metadata Extracted."); } catch (e) { toast.error("AI Analysis Failed."); } finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, []);
  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl"><DollarSign className="text-emerald-400" size={28} /></div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Michelin Executive Audit</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-100"><Save size={18}/> Salvar</button>
          <button onClick={exportConsolidatedPDF} className="px-6 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100"><BarChart3 size={18}/> Fluxo Global</button>
          <button onClick={exportIndividualPDF} className="px-6 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"><Download size={18}/> PDF CI</button>
          <button onClick={shareWhatsApp} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 flex items-center gap-2 shadow-xl shadow-emerald-100"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={14} className="text-blue-500" /> Invoice Metadata</h3>
              <div {...getBankRoot()} className="w-full h-32 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer overflow-hidden group"><input {...getBankInput()} />{form.bankImage ? <img src={form.bankImage} className="w-full h-full object-cover" /> : <div className="text-center"><FileDown className="mx-auto text-slate-300 mb-2" size={24}/><p className="text-[9px] font-black text-slate-400 uppercase">Audit Invoice</p></div>}</div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={14} className="text-emerald-500" /> Product Reference</h3>
              <div {...getProductRoot()} className="w-full h-32 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer overflow-hidden group"><input {...getProductInput()} />{form.productImage ? <img src={form.productImage} className="w-full h-full object-cover" /> : <div className="text-center"><Zap className="mx-auto text-slate-300 mb-2" size={24}/><p className="text-[9px] font-black text-slate-400 uppercase">Snapshot</p></div>}</div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center mb-2"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Audit Foundation</h2><div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 shadow-sm border border-emerald-100"><Ship size={14} /> ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Exporter / Supplier</label><input type="text" value={form.supplierName} onChange={(e) => setForm(prev => ({ ...prev, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none focus:ring-2 ring-blue-500/10" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Order Date</label><input type="date" value={form.orderDate} onChange={(e) => setForm(prev => ({ ...prev, orderDate: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Prod. Days</label><input type="number" value={form.productionDays} onChange={(e) => setForm(prev => ({ ...prev, productionDays: Number(e.target.value) }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Audit CI#</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(prev => ({ ...prev, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Container#</label><input type="text" value={form.containerNumber} onChange={(e) => setForm(prev => ({ ...prev, containerNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                </div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total Contract $</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(prev => ({ ...prev, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono-technical border-none shadow-inner" /></div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4"><div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Payment Preset (Ex: 30/70)</label><input type="text" value={form.paymentTerms} onChange={(e) => setForm(prev => ({ ...prev, paymentTerms: e.target.value }))} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none outline-none" placeholder="Ex: 30/70" /></div><button onClick={applyPaymentTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-purple-700 transition-all"><RefreshCw size={16}/></button></div>
            <div className="pt-6 border-t border-slate-100"><h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Landmark size={16} /> Beneficiary / Bank Details</h2><textarea value={form.bankDetails} onChange={(e) => setForm(prev => ({ ...prev, bankDetails: e.target.value }))} className="w-full h-24 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-600 border-none resize-none font-mono shadow-inner" placeholder="Paste bank info here..." /></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Financial Milestones</h2><button onClick={addMilestone} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-100">+ Add Step</button></div><div className="space-y-4">{form.milestones.map((m: Milestone) => {
            const isToday = m.date === todayStr;
            return (
              <div key={m.id} className={`p-4 rounded-[28px] border transition-all ${isToday ? 'bg-amber-50 border-amber-500 shadow-lg shadow-amber-100/50 animate-pulse' : 'bg-slate-50 border-slate-100 hover:border-blue-300'}`}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1">{isToday && <AlertCircle size={10} className="text-amber-500" />} Payment Phase</label>
                    <input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none" />
                  </div>
                  <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Due Date</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black" /></div>
                  <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Amount $</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">$</span><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 pl-6 bg-white border border-slate-100 rounded-lg text-[11px] font-mono-technical font-black" /></div></div>
                  <div className="flex gap-2">
                    <button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all ${m.isPaid ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAID' : 'PENDING'}</button>
                    <button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 transition-all group/btn"><Trash2 size={16} className="group-hover/btn:text-white"/></button>
                  </div>
                </div>
              </div>
            );
          })}</div></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="calculation-box p-8 shadow-xl shadow-emerald-100 border border-green-200/50"><h3 className="text-[11px] font-black uppercase text-green-900 border-b border-green-200/50 pb-4 flex items-center gap-2"><Calculator size={18} /> Executive Summary</h3><div className="space-y-6"><div className="p-6 bg-white/40 rounded-[32px] border border-green-200/50"><p className="text-[9px] opacity-60 uppercase font-black mb-1">Câmbio R$ {form.exchangeRate.toFixed(4)}</p><p className="text-xl font-black text-green-900 font-mono-technical">R$ {(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}</p><p className="text-[10px] opacity-60 uppercase font-black mt-4 mb-1">Global Debt</p><p className="text-2xl font-black text-green-900 font-mono-technical">$ {balanceDue.toLocaleString('pt-BR')}</p></div><div className="w-full h-3 bg-white/50 rounded-full overflow-hidden p-0.5"><div className="h-full bg-green-600 rounded-full transition-all duration-1000 shadow-xl" style={{ width: `${(totalPaid / (form.contractTotal || 1)) * 100}%` }}></div></div></div></div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm"><h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={16} className="text-blue-500" /> Global Records</h3><div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">{history.map((h: any) => (<div key={h.id} onClick={() => loadFromHistory(h)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-400 hover:bg-white transition-all group relative cursor-pointer"><button onClick={(e) => { e.stopPropagation(); deleteHistoryRecord(h.id); }} className="absolute top-2 right-2 w-6 h-6 bg-red-50 text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><X size={12}/></button><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "S/ REF"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p><p className="text-[11px] font-mono-technical font-black text-blue-600 mt-1">$ {Number(h.data?.contractTotal || 0).toLocaleString('pt-BR')}</p></div>))}</div></div>
        </div>
      </div>

      {/* WHATSAPP MODAL */}
      {showMsg && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"><div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-500"><div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">Executive Messenger <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div><div className="p-8 bg-slate-50"><textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[400px] p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none shadow-inner" /><div className="flex gap-4 mt-6"><button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copied to Clipboard."); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-slate-800 transition-all">Copy</button><a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-emerald-700 transition-all text-center">Send via WhatsApp</a></div></div></div></div>)}
    </div>
  );
}
