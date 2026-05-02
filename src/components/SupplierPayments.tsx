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
  FileCheck2
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
      toast.success("Audit Salvo!");
    } catch (e) { toast.error("Erro no salvamento."); } finally { setLoading(false); }
  };

  const clearAllHistory = () => { if (window.confirm("Zerar Histórico?")) { setHistory([]); localStorage.removeItem('ADUANAPRO_PAYMENTS_HISTORY'); setSelectedIds([]); toast.success("Reset OK!"); } };

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
    autoTable(doc, { startY: 55, head: [['DATE', 'SUPPLIER', 'REF', 'PHASE', 'USD', 'STATUS']], body: tableData, theme: 'grid', headStyles: { fillStyle: [15, 23, 42] } });
    doc.save("Global_Audit.pdf");
  };

  const exportSupplierPDF = () => {
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;

    // 1. LOGO SIMULADO (M)
    doc.setFillColor(249, 115, 22); doc.circle(pageWidth/2, 25, 10, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text("m", pageWidth/2 - 2, 27);

    // 2. HEADER TITLES
    doc.setTextColor(15, 23, 42); doc.setFontSize(24); doc.setFont(undefined, 'bold');
    doc.text("Payment Status Report", pageWidth/2, 45, { align: 'center' });
    doc.setTextColor(249, 115, 22); doc.setFontSize(10); doc.text("OFFICIAL ORDER VERIFICATION", pageWidth/2, 52, { align: 'center' });
    
    doc.setDrawColor(226, 232, 240); doc.line(margin, 60, pageWidth - margin, 60);

    // 3. ORDER INFO
    doc.setTextColor(15, 23, 42); doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text(form.supplierName.toUpperCase(), margin, 75);
    doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`REFERENCE: ${form.ciNumber}`, margin, 82);

    doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.text("CONTRACT TOTAL", pageWidth - margin - 35, 75);
    doc.setTextColor(15, 23, 42); doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(`USD ${form.contractTotal.toLocaleString('en-US')}`, pageWidth - margin, 83, { align: 'right' });

    // 4. SUMMARY BOXES
    const totalPaid = form.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
    const balance = form.contractTotal - totalPaid;
    const paidPct = ((totalPaid / (form.contractTotal || 1)) * 100).toFixed(1);
    const balancePct = ((balance / (form.contractTotal || 1)) * 100).toFixed(1);

    // BOX GREEN
    doc.setFillColor(240, 253, 244); doc.roundedRect(margin, 100, 80, 50, 5, 5, 'F');
    doc.setTextColor(22, 101, 52); doc.setFontSize(8); doc.text("PAID AMOUNT", margin + 10, 112);
    doc.text(`${paidPct}%`, margin + 70, 112, { align: 'right' });
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(`USD ${totalPaid.toLocaleString('en-US')}`, margin + 10, 128);
    doc.setFillColor(187, 247, 208); doc.roundedRect(margin + 10, 138, 60, 4, 2, 2, 'F'); // Progress Track
    doc.setFillColor(34, 197, 94); doc.roundedRect(margin + 10, 138, (Number(paidPct)/100)*60, 4, 2, 2, 'F'); // Progress Bar

    // BOX RED
    doc.setFillColor(254, 242, 242); doc.roundedRect(pageWidth - margin - 80, 100, 80, 50, 5, 5, 'F');
    doc.setTextColor(153, 27, 27); doc.setFontSize(8); doc.text("REMAINING BALANCE", pageWidth - margin - 70, 112);
    doc.text(`${balancePct}%`, pageWidth - margin - 10, 112, { align: 'right' });
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(`USD ${balance.toLocaleString('en-US')}`, pageWidth - margin - 70, 128);
    doc.setFillColor(FECACA, 202, 202); doc.setFillColor(254, 202, 202); doc.roundedRect(pageWidth - margin - 70, 138, 60, 4, 2, 2, 'F');
    doc.setFillColor(239, 68, 68); doc.roundedRect(pageWidth - margin - 70, 138, (Number(balancePct)/100)*60, 4, 2, 2, 'F');

    // 5. LEDGER TABLE
    doc.setTextColor(148, 163, 184); doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text("PAYMENT LEDGER", margin, 170);
    doc.setFontSize(8); doc.text(`Paid: USD ${totalPaid.toLocaleString('en-US')}`, pageWidth - margin, 170, { align: 'right' });

    const tableData = form.milestones.map(m => {
      const pct = ((m.amount / (form.contractTotal || 1)) * 100).toFixed(1) + '%';
      return [
        { content: `${new Date(m.date + 'T12:00:00').toLocaleDateString('en-US')}\n${m.isPaid ? 'CONFIRMED PAID' : 'PENDING LIQUIDATION'}`, styles: { textColor: m.isPaid ? [22, 101, 52] : [148, 163, 184], fontStyle: m.isPaid ? 'bold' : 'normal', fontSize: 7 } },
        m.description.toUpperCase(),
        pct,
        `USD ${m.amount.toLocaleString('en-US')}`
      ];
    });

    autoTable(doc, {
      startY: 175,
      head: [['DATE', 'DESCRIPTION/MILESTONE', 'SHARE', 'USD VALUE']],
      body: tableData,
      theme: 'plain',
      headStyles: { textColor: [148, 163, 184], fontSize: 8, fontStyle: 'bold', borderBottom: { color: [226, 232, 240], width: 1 } },
      styles: { fontSize: 9, cellPadding: 6 },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.row.index >= 0) {
            const m = form.milestones[data.row.index];
            if (m && m.isPaid && m.date === todayStr) {
                data.cell.styles.fillColor = [255, 251, 235]; // Highlight New Payment
            }
        }
      }
    });

    doc.save(`Verification_${form.ciNumber}.pdf`);
  };

  const shareWhatsApp = () => {
    const todayMs = form.milestones.filter(m => m.date === todayStr && !m.isPaid);
    const hasToday = todayMs.length > 0;
    let urgency = hasToday ? `🚨 *URGENTE:* -------------------------> *PAGAR HOJE*\n` : "";
    if (hasToday) {
      todayMs.forEach(m => {
        const pct = ((m.amount / (form.contractTotal || 1)) * 100).toFixed(0) + '%';
        urgency += `*${m.description.toUpperCase()} (${pct})*\nUSD $ ${m.amount.toLocaleString('pt-BR')} | BRL EST. R$ ${(m.amount * form.exchangeRate).toLocaleString('pt-BR')}\n`;
      });
      urgency += `-----------------------------------------\n\n`;
    }
    const bank = form.bankDetails.split('\n').slice(0, 5).join(' | ');
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Segue formalização:\n\n📄 *DADOS:* ${form.ciNumber}\n📦 *CONTAINER:* ${form.containerNumber}\n🚢 *EMBARQUE:* ${shipmentDate}\n\n${urgency}💰 *FINANCEIRO:*` + "```" + `\nTOTAL: $ ${form.contractTotal.toLocaleString('pt-BR')}\nTAXA: R$ ${form.exchangeRate.toFixed(4)}\nBRL: R$ ${(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}\n` + "```" + `\n\n`;
    if (form.milestones.length > 0) {
      text += `📅 *PARCELAS:*` + "```" + `\n` + form.milestones.map(m => {
        const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').substring(0, 5);
        const pct = ((m.amount / (form.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ') + '%';
        const indicator = m.date === todayStr ? ' <--- HOJE' : (m.isPaid ? ' ✓' : '  ');
        return `${dt} | ${pct} | $ ${m.amount.toLocaleString('pt-BR').padStart(10)}${indicator}`;
      }).join('\n') + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:* ${bank.substring(0, 250)}...\n\n🤝 #Pg_${form.ciNumber}`;
    setWhatsappText(text); setShowMsg(true);
  };

  const totalPaid = form.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = form.contractTotal - totalPaid;

  const onDropProd = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setForm(prev => ({ ...prev, productImage: r.result as string })); r.readAsDataURL(f[0]); }, []);
  const onDropBank = useCallback(async (f: File[]) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setForm(prev => ({ ...prev, bankImage: b })); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setForm(prev => ({ ...prev, bankDetails: ex.bankDetails })); toast.success("AI OK!"); } catch (e) { toast.error("IA Falhou."); } finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, []);
  const { getRootProps: gp, getInputProps: ip } = useDropzone({ onDrop: onDropProd, accept: {'image/*': []}, multiple: false });
  const { getRootProps: gb, getInputProps: ib } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl"><DollarSign className="text-emerald-400" size={28} /></div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Michelin Status Report</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl"><Save size={18}/> Salvar</button>
          <button onClick={exportSupplierPDF} className="px-6 py-4 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-orange-600 transition-all flex items-center gap-2 shadow-lg shadow-orange-100"><FileCheck2 size={18}/> Status Report (EN)</button>
          <button onClick={shareWhatsApp} className="px-6 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 flex items-center gap-2 shadow-xl shadow-emerald-200"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={14} className="text-blue-500" /> Invoice Data</h3>
              <div {...gb()} className="w-full h-32 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer overflow-hidden group"><input {...ib()} />{form.bankImage ? <img src={form.bankImage} className="w-full h-full object-cover" /> : <div className="text-center"><FileDown className="mx-auto text-slate-300 mb-2" size={24}/><p className="text-[9px] font-black text-slate-400 uppercase">Audit AI</p></div>}</div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={14} className="text-emerald-500" /> Foto Referência</h3>
              <div {...gp()} className="w-full h-32 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer overflow-hidden group"><input {...ip()} />{form.productImage ? <img src={form.productImage} className="w-full h-full object-cover" /> : <div className="text-center"><Zap className="mx-auto text-slate-300 mb-2" size={24}/><p className="text-[9px] font-black text-slate-400 uppercase">Snapshot</p></div>}</div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center mb-2"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2"><LayoutGrid size={16} /> Audit Core</h2><div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 border ${form.milestones.some(m => m.date === todayStr && !m.isPaid) ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}><Ship size={14} /> ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Exportador</label><input type="text" value={form.supplierName} onChange={(e) => setForm(p => ({ ...p, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Pedido</label><input type="date" value={form.orderDate} onChange={(e) => setForm(p => ({ ...p, orderDate: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Lead Time</label><input type="number" value={form.productionDays} onChange={(e) => setForm(p => ({ ...p, productionDays: Number(e.target.value) }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black border-none" /></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Ref CI</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(p => ({ ...p, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase block">Container</label><input type="text" value={form.containerNumber} onChange={(e) => setForm(p => ({ ...p, containerNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none" /></div>
                </div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total Contrato USD $</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(p => ({ ...p, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono-technical border-none shadow-inner" /></div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4"><div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Condição de Pagamento</label><input type="text" value={form.paymentTerms} onChange={(e) => setForm(p => ({ ...p, paymentTerms: e.target.value }))} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none outline-none" /></div><button onClick={applyPaymentTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg"><RefreshCw size={16}/></button></div>
            <div className="pt-6 border-t border-slate-100"><h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Landmark size={16} /> Banco</h2><textarea value={form.bankDetails} onChange={(e) => setForm(p => ({ ...p, bankDetails: e.target.value }))} className="w-full h-24 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-600 border-none resize-none font-mono shadow-inner" /></div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Cronograma Financeiro</h2><button onClick={addMilestone} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg">+ Add</button></div><div className="space-y-4">{form.milestones.map((m: Milestone) => (<div key={m.id} className={`p-4 rounded-[28px] border transition-all ${m.date === todayStr ? 'bg-amber-50 border-amber-500 shadow-lg' : 'bg-slate-50 border-slate-100'}`}><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Fase ({((m.amount/(form.contractTotal||1))*100).toFixed(0)}%)</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">{m.date === todayStr ? '⚠️ HOJE' : 'Vencimento'}</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black outline-none" /></div><div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">USD $</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(m.amount) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" /></div><div className="flex gap-2"><button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm ${m.isPaid ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PEND'}</button><button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={16}/></button></div></div></div>))}</div></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="p-8 bg-white rounded-[40px] shadow-sm border border-slate-100"><h3 className="text-[11px] font-black text-slate-800 mb-6 flex items-center gap-2 uppercase"><Calculator size={18} /> Resumo Gerencial</h3><div className="space-y-6"><div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100"><p className="text-[9px] text-slate-400 uppercase font-black mb-1">Câmbio: R$ {form.exchangeRate.toFixed(4)}</p><p className="text-xl font-black text-slate-900 font-mono-technical">R$ {(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}</p><p className="text-[10px] text-slate-400 uppercase font-black mt-4 mb-1">Em Aberto</p><p className="text-2xl font-black text-red-600 font-mono-technical">$ {balanceDue.toLocaleString('pt-BR')}</p></div><div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-xl" style={{ width: `${(totalPaid / (form.contractTotal || 1)) * 100}%` }}></div></div></div></div>
          
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-6"><h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><History size={16} className="text-blue-500" /> Histórico</h3><button onClick={clearAllHistory} className="w-8 h-8 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><Eraser size={14}/></button></div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">{history.map((h: any) => (<div key={h.id} className="flex items-center gap-2 group"><div onClick={() => setSelectedIds(prev => prev.includes(h.id) ? prev.filter(id => id !== h.id) : [...prev, h.id])} className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all ${selectedIds.includes(h.id) ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>{selectedIds.includes(h.id) ? <CheckSquare size={14}/> : <Square size={14}/>}</div><div onClick={() => setForm({ ...h.data })} className={`flex-1 p-4 rounded-2xl border transition-all cursor-pointer ${selectedIds.includes(h.id) ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-100'}`}><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "N/A"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p></div><button onClick={() => setHistory(history.filter(x => x.id !== h.id))} className="w-8 h-8 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={14}/></button></div>))}</div>
          </div>
        </div>
      </div>

      {showMsg && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"><div className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden"><div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">Executive Messenger <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div><div className="p-8 bg-slate-50"><textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[450px] p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none shadow-inner" /><div className="flex gap-4 mt-6"><button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado."); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase">Copy</button><a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase text-center">Send</a></div></div></div></div>)}
    </div>
  );
}
