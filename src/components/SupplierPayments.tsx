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
  PenTool
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parsePaymentReceiptWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
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
    contractTotal: Number(data?.contractTotal || 0),
    currency: data?.currency || "USD",
    containerNumber: data?.containerNumber || "N/E",
    exchangeRate: Number(data?.exchangeRate || 0),
    productName: data?.productName || "",
    bankDetails: data?.bankDetails || "",
    recipientName: data?.recipientName || "Eveline",
    orderDate: data?.orderDate || new Date().toISOString().split('T')[0],
    productionDays: Number(data?.productionDays || 30),
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

  // Sincronização Segura
  // Salvamento manual via botão para evitar loops de reinicialização
  const lastUpdateRef = useRef("");

  // Câmbio
  useEffect(() => {
    if (!form.exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(res => res.json()).then(json => setForm(p => ({ ...p, exchangeRate: parseFloat(json.USDBRL.bid) }))).catch(() => {});
    }
  }, []);

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setForm(p => ({ ...p, milestones: p.milestones.map(m => m.id === id ? { ...m, ...updates } : m) }));
  };

  const addMilestone = () => {
    const n: Milestone = { id: Math.random().toString(36).substring(2, 9), description: "Phase", percentage: 0, amount: 0, isPaid: false, date: todayStr };
    setForm(p => ({ ...p, milestones: [...p.milestones, n] }));
  };

  const applyTerms = () => {
    const parts = form.paymentTerms.split('/').map(p => parseFloat(p));
    const ms: Milestone[] = parts.map((pct, i) => {
      const d = new Date(form.orderDate + 'T12:00:00');
      if (i > 0) d.setDate(d.getDate() + form.productionDays);
      return { id: Math.random().toString(36).substring(2, 9), description: i === 0 ? "Advance" : "Balance", percentage: pct, amount: (form.contractTotal * pct) / 100, isPaid: false, date: d.toISOString().split('T')[0] };
    });
    setForm(p => ({ ...p, milestones: ms }));
  };

  const saveRecord = () => {
    const rid = form.ciNumber !== "N/E" ? form.ciNumber : `R_${Date.now()}`;
    const nh = [ { id: rid, data: { ...form } }, ...history.filter(h => h.id !== rid) ];
    setHistory(nh);
    localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(nh));
    toast.success("Salvo!");
  };

  const nextPayments = useMemo(() => {
    if (selectedIds.length === 0) return [];
    return history.filter(h => selectedIds.includes(h.id)).map(r => {
      const ms = r.data?.milestones || [];
      const pendings = ms.filter((m: any) => !m.isPaid).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return pendings.length > 0 ? { ...pendings[0], supplier: r.data?.supplierName, ref: r.data?.ciNumber, parentTotal: r.data?.contractTotal } : null;
    }).filter(Boolean).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedIds, history]);

  const exportNextPDF = () => {
    const doc = new jsPDF() as any;
    const table = nextPayments.map((p: any) => [new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR'), p.supplier, p.ref, `$ ${p.amount.toLocaleString('pt-BR')}`]);
    autoTable(doc, { head: [['DATA', 'FORNECEDOR', 'REF', 'VALOR USD']], body: table });
    doc.save("Cronograma.pdf");
  };

  const exportStatusPDF = () => {
    const selectedRecords = history.filter(h => selectedIds.includes(h.id));
    if (selectedRecords.length === 0) {
      toast.error("Selecione ao menos um item no histórico para exportar.");
      return;
    }

    const doc = new jsPDF() as any;
    const pw = doc.internal.pageSize.width;
    const ph = doc.internal.pageSize.height;
    let y = 15;

    // Cabeçalho Principal
    if (companyLogo) {
      try { doc.addImage(companyLogo, 'PNG', 15, y, 30, 15); } catch(e){}
    }
    
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO CONSOLIDADO DE STATUS", pw - 15, y + 10, { align: 'right' });
    y += 25;

    selectedRecords.forEach((record, index) => {
      const f = record.data;
      const estimatedHeight = 50 + (f.milestones?.length || 0) * 8; // Estimativa de altura do bloco

      // Verifica se precisa de nova página
      if (y + estimatedHeight > ph - 20) {
        doc.addPage();
        y = 15;
      }

      // Separador sutil entre registros
      if (index > 0) {
        doc.setDrawColor(240);
        doc.line(15, y - 5, pw - 15, y - 5);
      }

      // Foto Reduzida (Miniatura)
      if (f.productImage) {
        try { 
          doc.addImage(f.productImage, 'JPEG', 15, y, 20, 20); 
        } catch(e){
          doc.setDrawColor(230); doc.rect(15, y, 20, 20);
        }
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(f.supplierName?.toUpperCase() || "FORNECEDOR N/I", 40, y + 5);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`CI: ${f.ciNumber || "N/E"} | CTN: ${f.containerNumber || "N/E"}`, 40, y + 10);
      
      // Resumo Financeiro Compacto
      const totalPaid = (f.milestones || []).filter((m: any) => m.isPaid).reduce((acc: number, cur: any) => acc + Number(cur.amount), 0);
      const totalPending = Number(f.contractTotal || 0) - totalPaid;
      
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`TOTAL: $ ${Number(f.contractTotal || 0).toLocaleString('en-US')}`, 40, y + 16);
      doc.setTextColor(16, 185, 129);
      doc.text(`PAGO: $ ${totalPaid.toLocaleString('en-US')}`, 80, y + 16);
      doc.setTextColor(244, 63, 94);
      doc.text(`SALDO: $ ${totalPending.toLocaleString('en-US')}`, 115, y + 16);

      y += 22;

      // Tabela Ultra-Compacta
      const tableData = (f.milestones || []).map((m: any) => [
        new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR'),
        m.description?.toUpperCase(),
        m.isPaid ? 'PAGO' : 'PENDENTE',
        `${m.percentage}%`,
        `$ ${Number(m.amount).toLocaleString('en-US')}`
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        head: [['DATA', 'FASE', 'STATUS', '%', 'VALOR USD']],
        body: tableData,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
        columnStyles: {
          2: { fontStyle: 'bold' },
          4: { halign: 'right', fontStyle: 'bold' }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            const status = data.cell.raw;
            if (status === 'PAGO') doc.setTextColor(16, 185, 129);
            else doc.setTextColor(244, 63, 94);
          }
        }
      });

      y = (doc as any).lastAutoTable.finalY + 12;
    });

    doc.save(`Status_Consolidado_${new Date().getTime()}.pdf`);
    toast.success("Relatório Compacto gerado!");
  };

  // DROPZONES (NO TOPO)
  const { getRootProps: gL, getInputProps: iL } = useDropzone({ onDrop: (f) => { const r = new FileReader(); r.onload = () => { localStorage.setItem('ADUANAPRO_COMPANY_LOGO', r.result as string); window.location.reload(); }; r.readAsDataURL(f[0]); }, accept: {'image/*': []}, multiple: false });
  const { getRootProps: gP, getInputProps: iP } = useDropzone({ onDrop: (f) => { const r = new FileReader(); r.onload = () => setForm(p => ({ ...p, productImage: r.result as string })); r.readAsDataURL(f[0]); }, accept: {'image/*': []}, multiple: false });
  
  // NOVO: Dropzone para Commercial Invoice (Preenchimento Automático)
  const { getRootProps: gCI, getInputProps: iCI, isDragActive: isDragCI } = useDropzone({ 
    onDrop: async (f) => {
      setLoading(true);
      const r = new FileReader();
      r.onload = async () => {
        try {
          const t = await extractTextFromPDF(f[0]);
          // Aqui chamamos o groqService (usando a mesma lógica do SWIFT adaptada ou uma nova se necessário)
          const ex = await parsePaymentReceiptWithGroq(r.result as string, f[0].type, t);
          if (ex) {
            setForm(p => ({
              ...p,
              supplierName: ex.supplierName || p.supplierName,
              ciNumber: ex.ciNumber || p.ciNumber,
              contractTotal: Number(ex.contractTotal || p.contractTotal),
              bankDetails: ex.bankDetails || p.bankDetails
            }));
            toast.success("Dados da CI extraídos com sucesso!");
          }
        } catch(e) {
          toast.error("Erro ao ler CI");
        } finally {
          setLoading(false);
        }
      };
      r.readAsDataURL(f[0]);
    }, 
    accept: {'image/*': [], 'application/pdf': []}, 
    multiple: false 
  });

  const { getRootProps: gB, getInputProps: iB, isDragActive: isDragB } = useDropzone({ onDrop: async (f) => { const r = new FileReader(); r.onload = async () => { setForm(p => ({ ...p, bankImage: r.result as string })); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(r.result as string, f[0].type, t); if (ex.bankDetails) setForm(p => ({ ...p, bankDetails: ex.bankDetails })); } catch(e){} finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  const shipmentDate = useMemo(() => {
    const d = new Date(form.orderDate + 'T12:00:00');
    if (isNaN(d.getTime())) return "N/E";
    d.setDate(d.getDate() + (Number(form.productionDays) || 0) + 10);
    return d.toLocaleDateString('pt-BR');
  }, [form.orderDate, form.productionDays]);

  const sendWhatsapp = (p: any) => {
    const text = `💼 *SOLICITAÇÃO DE PAGAMENTO - ${form.supplierName}*\n\n` +
                 `${form.recipientName}, bom dia! 🏦 gostaria de formalizar o pedido de lançamento de câmbio conforme abaixo:\n\n` +
                 `*Ref. Pedido:* ${p.ref} 📄\n` +
                 `*Containers:* ${form.containerNumber || 'Não especificado'}\n` +
                 `*Produto:* ${form.productName || 'N/I'}\n` +
                 `*Previsão de Embarque:* ${shipmentDate} 🚢\n` +
                 `----------------------------------\n\n` +
                 `*MILESTONE:* ${p.description}\n` +
                 `*VALOR:* $ ${Number(p.amount).toLocaleString('pt-BR')}\n` +
                 `*DATA PROGRAMADA:* ${new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}\n\n` +
                 `🏦 *DADOS BANCÁRIOS / OBSERVAÇÕES:*\n` +
                 `${form.bankDetails || 'Consultar Invoice Anexa'}\n\n` +
                 `Fico no aguardo do comprovante de pagamento, obrigado! 🤝\n\n` +
                 `#Pagamento_${p.ref.replace(/\s/g, '')}_`;
    setWhatsappText(text);
    setShowMsg(true);
  };

  const sendGlobalWhatsapp = () => {
    const totalPaid = form.milestones.filter((m: any) => m.isPaid).reduce((acc: number, cur: any) => acc + Number(cur.amount), 0);
    const totalUnpaid = form.contractTotal - totalPaid;
    const paidPct = ((totalPaid / (form.contractTotal || 1)) * 100).toFixed(1);
    const unpaidPct = ((totalUnpaid / (form.contractTotal || 1)) * 100).toFixed(1);
    const brlValue = (form.contractTotal * (form.exchangeRate || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const m = (val: any) => `\`${val}\``; // Helper para monoespaçado

    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO - ${form.supplierName}*\n\n` +
               `${form.recipientName}, bom dia! 🏦 gostaria de formalizar o pedido de lançamento de câmbio conforme abaixo:\n\n` +
               `*Ref. Pedido:* ${m(form.ciNumber)} 📄\n` +
               `*Containers:* ${form.containerNumber || 'Não especificado'}\n` +
               `*Produto:* ${form.productName || 'N/I'}\n` +
               `*Previsão de Embarque:* ${m(shipmentDate)} 🚢\n` +
               `----------------------------------\n` +
               `*VALOR TOTAL DO CONTRATO:* 💰 USD ${m(form.contractTotal.toLocaleString('pt-BR'))} (R$ ${m(brlValue)})\n` +
               `*TOTAL JÁ LIQUIDADO:* USD ${m(totalPaid.toLocaleString('pt-BR'))} (${m(paidPct)}%)\n` +
               `*SALDO REMANESCENTE:* USD ${m(totalUnpaid.toLocaleString('pt-BR'))} (${m(unpaidPct)}%)\n\n` +
               `*PARCELAS CONTRATO:*\n`;
               
    form.milestones.forEach((p: any) => {
      const dateFormatted = new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR');
      const isToday = p.date === todayStr;
      const line = `• Vencimento: ${m(dateFormatted)} | Valor: USD ${m(p.amount.toLocaleString('pt-BR'))} (${m(p.percentage)}%)${isToday ? ' <--- HOJE' : ''}`;
      text += p.isPaid ? `~${line}~\n` : `${line}\n`;
    });
    
    text += `\n🏦 *DADOS BANCÁRIOS / OBSERVAÇÕES:*\n` +
            `${form.bankDetails || 'Consultar Invoice Anexa'}\n\n` +
            `Fico no aguardo do comprovante de pagamento, obrigado! 🤝\n\n` +
            `#Pagamento_${form.ciNumber.replace(/\s/g, '')}_`;
            
    setWhatsappText(text);
    setShowMsg(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whatsappText);
    toast.success("Mensagem copiada com sucesso!");
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase flex items-center gap-2"><MessageSquare className="text-emerald-400"/> Prévia do Câmbio</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Confira os dados antes de copiar</p>
              </div>
              <button onClick={() => setShowMsg(false)} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center hover:bg-white/20 transition-all"><X/></button>
            </div>
            <div className="p-8">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 max-h-[400px] overflow-y-auto custom-scrollbar">
                <pre className="text-[12px] font-medium text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{whatsappText}</pre>
              </div>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={copyToClipboard} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[11px] flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-xl"><CheckCircle size={18}/> Copiar Mensagem</button>
                <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`, '_blank')} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[11px] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 shadow-xl"><MessageSquare size={18}/> Enviar p/ WhatsApp</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">{companyLogo ? <img src={companyLogo} className="w-10 h-10 object-contain" /> : <DollarSign className="text-emerald-400" size={28} />}</div>
          <div><h1 className="text-3xl font-black text-slate-900 uppercase leading-none">Gestão Financeira</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Safe Mode Active</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={sendGlobalWhatsapp} className="px-6 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg"><MessageSquare size={18}/> WhatsApp Financeiro</button>
          <button onClick={saveRecord} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"><Save size={18}/> Salvar</button>
          <button onClick={exportStatusPDF} className="px-6 py-4 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg"><FileCheck size={18}/> Status Report</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-6 rounded-[32px] border border-blue-100 flex items-center gap-6">
            <div className="flex-1"><h3 className="text-[11px] font-black text-blue-600 uppercase mb-1">Sua Logo</h3><p className="text-[10px] text-slate-400">Arraste sua marca aqui.</p></div>
            <div {...gL()} className="w-32 h-20 border-2 border-dashed border-blue-200 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden"><input {...iL()} />{companyLogo ? <img src={companyLogo} className="w-full h-full object-contain" /> : <Upload className="text-blue-300" size={20}/>}</div>
          </div>

          {/* Grid de Uploads: CI e Foto do Produto lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Super Dropzone para CI */}
            <div {...gCI()} className={`group p-8 rounded-[40px] border-4 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${isDragCI ? 'bg-blue-50 border-blue-500 scale-[1.02] shadow-2xl' : 'bg-white border-slate-100 hover:border-blue-300'}`}>
              <input {...iCI()} />
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isDragCI ? 'bg-blue-500 text-white animate-bounce' : 'bg-blue-50 text-blue-500'}`}>
                <Upload size={28} />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Extrair Dados da CI</h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[2px] mt-1">Arraste a Invoice aqui</p>
              </div>
            </div>

            {/* Snapshot (Foto do Produto) - Agora em destaque ao lado da CI */}
            <div {...gP()} className={`group p-8 rounded-[40px] border-4 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden ${form.productImage ? 'border-emerald-500 bg-emerald-50/30' : 'bg-white border-slate-100 hover:border-emerald-300'}`}>
              <input {...iP()} />
              {form.productImage ? (
                <img src={form.productImage} className="w-full h-32 object-contain" />
              ) : (
                <>
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                    <ImageIcon size={28} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Foto do Produto</h3>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[2px] mt-1">Arraste a Foto aqui</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex justify-between items-center"><h2 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2"><LayoutGrid size={16} /> Audit Core</h2><div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase">ETD: {shipmentDate}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Exportador</label><input type="text" value={form.supplierName} onChange={(e) => setForm(p => ({ ...p, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase border-none focus:ring-2 ring-blue-500/20 outline-none" /></div>
                <div><label className="text-[10px] font-black text-blue-600 uppercase block mb-1">Número da Invoice (CI)</label><input type="text" placeholder="Ex: CI-2024-001" value={form.ciNumber} onChange={(e) => setForm(p => ({ ...p, ciNumber: e.target.value }))} className="w-full p-5 bg-blue-50 border-2 border-blue-200 rounded-2xl text-[13px] font-black uppercase text-blue-900 shadow-sm focus:ring-4 ring-blue-500/10 outline-none transition-all" /></div>
                <div {...gB()} className="w-full h-24 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden group hover:border-blue-400 transition-all"><input {...iB()} />{form.bankImage ? <img src={form.bankImage} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center text-slate-300 group-hover:text-blue-400"><FileDown size={24}/><span className="text-[8px] font-black uppercase mt-1">SWIFT / Bank</span></div>}</div>
              </div>
              <div className="space-y-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase block">Total USD $</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(p => ({ ...p, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[16px] font-black font-mono shadow-inner border-none" /></div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 h-40 flex flex-col justify-center">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2 flex items-center gap-2"><Globe2 size={14}/> Containers</h3>
                   <textarea value={form.containerNumber} onChange={(e) => setForm(p => ({ ...p, containerNumber: e.target.value }))} className="w-full h-full bg-transparent border-none text-[10px] font-bold text-slate-600 outline-none resize-none" placeholder="Lista de Containers..."></textarea>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 flex gap-4">
              <div className="flex-1"><label className="text-[9px] font-black text-purple-600 uppercase block">Condição (30/70)</label><input type="text" value={form.paymentTerms} onChange={(e) => setForm(p => ({ ...p, paymentTerms: e.target.value }))} className="w-full p-4 bg-purple-50 rounded-2xl text-[12px] font-black text-purple-900 border-none outline-none focus:ring-2 ring-purple-500/20" /></div>
              <div className="flex-1"><label className="text-[9px] font-black text-slate-400 uppercase block">Responsável</label><input type="text" value={form.recipientName} onChange={(e) => setForm(p => ({ ...p, recipientName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[12px] font-black text-slate-900 border-none outline-none focus:ring-2 ring-blue-500/20" /></div>
              <button onClick={applyTerms} className="mt-5 px-6 bg-purple-600 text-white rounded-2xl shadow-lg hover:bg-purple-700 transition-all active:scale-95"><RefreshCw size={16}/></button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"><h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500" /> Milestones</h2><div className="space-y-4">{form.milestones.map((m: Milestone) => (<div key={m.id} className="p-4 rounded-[28px] border bg-slate-50 border-slate-100"><div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"><div><label className="text-[8px] font-black text-slate-400 uppercase">Fase</label><input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none" /></div><div><label className="text-[8px] font-black text-slate-400 uppercase">Data</label><input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[10px] font-black outline-none" /></div><div><label className="text-[8px] font-black text-slate-400 uppercase">USD $</label><input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" /></div><div className="flex gap-2">
  <button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m.isPaid ? 'PAGO' : 'PEND'}</button>
  <button onClick={() => sendWhatsapp({...m, ref: form.ciNumber})} className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-100"><MessageSquare size={16}/></button>
  <button onClick={() => setForm(p => ({ ...p, milestones: p.milestones.filter(x => x.id !== m.id) }))} className="w-10 h-10 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16}/></button>
</div></div></div>))}</div><button onClick={addMilestone} className="mt-6 w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all">+ Add Parcela</button></div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="p-8 bg-slate-900 rounded-[40px] shadow-2xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="flex justify-between items-center mb-6 relative z-10"><h3 className="text-[11px] font-black text-emerald-400 uppercase flex items-center gap-2"><TrendingUp size={18} /> Próximo Passo</h3>{nextPayments.length > 0 && (<button onClick={exportNextPDF} className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all"><Download size={18}/></button>)}</div>
            <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
              {nextPayments.map((p: any, idx) => (<div key={idx} className="p-5 bg-slate-800/50 rounded-3xl border border-slate-700/50 relative group"><div className="flex justify-between items-start mb-2"><span className="text-[9px] font-black text-emerald-400 uppercase">{p.ref}</span><span className="text-[10px] font-black font-mono text-slate-400">{new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div><p className="text-[10px] font-bold text-slate-300 truncate mb-1">{p.supplier}</p><div className="flex justify-between items-center pt-3 border-t border-slate-700/50"><div className="flex flex-col"><p className="text-xl font-black text-white">$ {Number(p.amount||0).toLocaleString('pt-BR')}</p><span className="text-[9px] font-black text-slate-400 uppercase">{p.description}</span></div><button onClick={() => sendWhatsapp(p)} className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all shadow-inner"><MessageSquare size={18}/></button></div></div>))}
              {selectedIds.length === 0 && <div className="text-center py-12 opacity-30"><AlertCircle className="mx-auto mb-2" size={32} /><p className="text-[9px] font-black uppercase">Marque no histórico</p></div>}
            </div>
            <div className="mt-8 pt-6 border-t border-slate-800 relative z-10"><p className="text-[9px] text-slate-500 uppercase mb-1">Total Imediato</p><p className="text-3xl font-black text-emerald-400 font-mono tracking-tighter">$ {nextPayments.reduce((acc, p: any) => acc + Number(p.amount || 0), 0).toLocaleString('pt-BR')}</p></div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-800 uppercase mb-6 flex items-center gap-2"><History size={16} className="text-blue-500" /> Histórico</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {Array.isArray(history) && history.map((h: any) => (<div key={h.id} className="flex items-center gap-2 group"><div onClick={() => setSelectedIds(prev => prev.includes(h.id) ? prev.filter(id => id !== h.id) : [...prev, h.id])} className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all ${selectedIds.includes(h.id) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>{selectedIds.includes(h.id) ? <CheckSquare size={14}/> : <Square size={14}/>}</div><div onClick={() => setForm({ ...h.data })} className="flex-1 p-4 rounded-2xl border bg-slate-50 border-slate-100 cursor-pointer hover:bg-slate-100 transition-all"><p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "N/A"}</p><p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p></div><button onClick={() => setHistory(history.filter(x => x.id !== h.id))} className="w-8 h-8 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X size={14}/></button></div>))}
              {history.length === 0 && <div className="text-center py-10 opacity-20"><History className="mx-auto mb-2" size={24}/><p className="text-[8px] font-black uppercase">Histórico Vazio</p></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
