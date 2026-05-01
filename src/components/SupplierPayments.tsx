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
  TrendingUp,
  ShieldCheck,
  Zap,
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
    } catch (e) {
      console.error("Erro ao carregar histórico local", e);
      return [];
    }
  });

  const safeData = useMemo(() => ({
    supplierName: data?.supplierName || "FORNECEDOR N/I",
    ciNumber: data?.ciNumber || "N/E",
    contractTotal: Number(data?.contractTotal) || 0,
    currency: data?.currency || "USD",
    milestones: Array.isArray(data?.milestones) ? data.milestones : [],
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
    if (onUpdate && safeData) {
      onUpdate(safeData);
    }
  }, [safeData]);

  useEffect(() => {
    if (!exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => setExchangeRate(parseFloat(json.USDBRL.bid)))
        .catch(() => {});
    }
  }, []);

  const totalPaid = (safeData.milestones || []).filter(m => m.isPaid).reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const balanceDue = (safeData.contractTotal || 0) - totalPaid;

  const onDropProduct = useCallback((f: File[]) => {
    const reader = new FileReader();
    reader.onload = () => setProductImage(reader.result as string);
    reader.readAsDataURL(f[0]);
  }, []);

  const onDropBank = useCallback(async (f: File[]) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setBankImage(base64);
      setLoading(true);
      try {
        const text = await extractTextFromPDF(f[0]);
        const extracted = await parsePaymentReceiptWithGroq(base64, f[0].type, text);
        if (extracted?.bankDetails) setBankDetails(extracted.bankDetails);
        toast.success("Dados bancários auditados!");
      } catch (e) {
        toast.error("Falha na extração de dados.");
      } finally { setLoading(false); }
    };
    reader.readAsDataURL(f[0]);
  }, []);

  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  const saveRecord = async () => {
    setLoading(true);
    const recordId = safeData.ciNumber !== "N/E" ? safeData.ciNumber : `REC_${Date.now()}`;
    const dataToSave = { ...safeData, updatedAt: new Date().toISOString() };

    try {
      const newHistory = [ { id: recordId, dateSaved: new Date().toISOString(), data: dataToSave }, ...history.filter(h => h.id !== recordId) ];
      setHistory(newHistory);
      localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
      
      if (IS_SUPABASE_CONFIGURED) {
        const { error } = await supabase.from('supplier_payments').upsert({
          id: recordId,
          supplier_name: safeData.supplierName,
          ci_number: safeData.ciNumber,
          contract_total: safeData.contractTotal,
          data: dataToSave,
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
        toast.success("Sincronizado na Nuvem!");
      }
    } catch (e) { toast.error("Erro ao salvar."); }
    finally { setLoading(false); }
  };

  const shareWhatsApp = () => {
    const etdDate = (() => {
      try {
        const d = new Date(orderDate + 'T12:00:00');
        d.setDate(d.getDate() + (Number(productionDays) || 0) + 10);
        return isNaN(d.getTime()) ? "N/E" : d.toLocaleDateString('pt-BR');
      } catch { return "N/E"; }
    })();

    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(safeData.ciNumber) || "Naoespecificado";

    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${safeData.supplierName}\n\n` +
               `${recipientName}, bom dia! 🏦 Gostaria de formalizar o pedido de lançamento de câmbio:\n\n` +
               `📄 *DADOS DO PEDIDO:*\n` +
               `• Ref: ${safeData.ciNumber}\n` +
               `• Container: ${safeData.containerNumber}\n` +
               `• Produto: ${safeData.productName}\n` +
               `• Embarque: *${etdDate}* 🚢\n\n` +
               `💰 *RESUMO FINANCEIRO:*\n` +
               "```" + `\n` +
               `CONTRATO: ${safeData.currency} ${(safeData.contractTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
               `CÂMBIO:    R$ ${(safeData.exchangeRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}\n` +
               `TOTAL BRL: R$ ${((safeData.contractTotal || 0) * (safeData.exchangeRate || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
               "```" + `\n\n`;

    if (safeData.milestones && safeData.milestones.length > 0) {
      text += `📅 *PARCELAS:*\n` +
              "```" + `\n` +
              `| DATA       | VALOR (${safeData.currency}) | %  |\n` +
              `|------------|----------------|----|\n` +
              safeData.milestones.map(m => {
                const pct = ((Number(m.amount) / (safeData.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ');
                const dObj = new Date(m.date + 'T12:00:00');
                const dt = isNaN(dObj.getTime()) ? "N/E" : dObj.toLocaleDateString('pt-BR').padEnd(10);
                const val = (Number(m.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14, ' ');
                return `| ${dt} | ${val} | ${pct}% |`;
              }).join('\n') +
              `\n` + "```" + `\n\n`;
    }

    text += `🏦 *BANCO:*\n${(bankDetails || "").substring(0, 150)}...\n\n` +
            `Fico no aguardo, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    setWhatsappText(text);
    setShowMsg(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 bg-[#f8fafc] min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <DollarSign className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Financial Management</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Audit & Payment Workflow Orchestration</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button onClick={saveRecord} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 group">
            <Save size={16} className="group-hover:scale-110 transition-transform" /> {loading ? "Processando..." : "Sincronizar Cloud"}
          </button>
          <button onClick={shareWhatsApp} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200 group">
            <MessageSquare size={16} className="group-hover:scale-110 transition-transform" /> WhatsApp
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* COLUNA ESQUERDA */}
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-8">
              <span className="w-8 h-[2px] bg-emerald-500"></span>
              <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em]">Operação Comercial</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="group">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Fornecedor Exportador</label>
                  <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
                    <Building2 className="text-slate-300" size={18} />
                    <span className="text-xs font-black text-slate-700 uppercase">{safeData?.supplierName}</span>
                  </div>
                </div>
                <div className="group">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Descrição do Produto</label>
                  <input 
                    type="text" 
                    value={productName} 
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full p-5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all uppercase" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Ref. Pedido</label>
                    <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData?.ciNumber}</div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Container</label>
                    <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData?.containerNumber}</div>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Responsável</label>
                  <input 
                    type="text" 
                    value={recipientName} 
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full p-5 bg-white border border-slate-200 rounded-2xl text-xs font-bold" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-10">
              <span className="w-8 h-[2px] bg-blue-500"></span>
              <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">Fluxo de Parcelas</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(safeData.milestones || []).map((m: Milestone) => (
                <div key={m.id} className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-blue-400 transition-all shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 shadow-sm'}`}>
                      {m.isPaid ? <CheckCircle size={22} /> : <Clock size={22} />}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Vencimento</p>
                      <p className="text-xs font-black text-slate-700">{new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight mb-1">{m.description}</h4>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-mono-technical font-black text-slate-900">{safeData.currency} {(Number(m.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">{m.percentage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div className="lg:col-span-4 space-y-8">
          <div className="calculation-box shadow-2xl shadow-emerald-200/50">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-8 border-b border-green-200/50 pb-4 flex items-center gap-2">
              <ShieldCheck size={18} /> Financial Audit
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[9px] opacity-60 uppercase font-black">Contrato Total ({safeData.currency})</p>
                <p className="text-3xl font-black tracking-tighter">{(safeData.contractTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-4 bg-white/40 rounded-2xl border border-green-200/50">
                <p className="text-[9px] opacity-60 uppercase font-black mb-1">Conversão BRL (R$ {exchangeRate.toFixed(4)})</p>
                <p className="text-sm font-black text-green-900">R$ {((safeData.contractTotal || 0) * (exchangeRate || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="pt-4 border-t border-green-200/50 space-y-3">
                <div className="flex justify-between text-[11px] font-bold opacity-70">
                  <span>LIQUIDADO:</span>
                  <span>{safeData.currency} {totalPaid.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-green-900">
                  <span>SALDO:</span>
                  <span>{safeData.currency} {balanceDue.toLocaleString('pt-BR')}</span>
                </div>
                <div className="w-full h-3 bg-white/50 rounded-full overflow-hidden p-0.5 mt-4">
                  <div className="h-full bg-green-600 rounded-full" style={{ width: `${(totalPaid / (safeData.contractTotal || 1)) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Digital Evidence</h3>
            <div className="space-y-6">
              <div {...getProductRoot()} className="group relative aspect-video rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer overflow-hidden">
                <input {...getProductInput()} />
                {productImage ? <img src={productImage} className="w-full h-full object-cover" alt="Product" /> : <Zap className="text-slate-300" size={32} />}
              </div>
              <textarea 
                value={bankDetails} 
                onChange={(e) => setBankDetails(e.target.value)}
                className="w-full h-32 p-5 bg-slate-50 rounded-3xl text-[10px] font-bold text-slate-600 border-none resize-none"
                placeholder="Dados bancários..."
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Histórico</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {(history || []).map((h: any) => h?.data?.supplierName === safeData.supplierName && (
                <div key={h.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between text-[10px] font-black mb-1">
                    <span>{h.data?.ciNumber}</span>
                    <span>{h.data?.contractTotal?.toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 truncate">{h.data?.productName}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* WHATSAPP MODAL */}
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[56px] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-500">
            <div className="bg-emerald-600 p-10 text-white flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black uppercase">WhatsApp Ready</h3>
                <p className="text-[10px] font-black opacity-70 uppercase tracking-widest mt-1">Audit Mode Active</p>
              </div>
              <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button>
            </div>
            <div className="p-10">
              <textarea 
                value={whatsappText} 
                onChange={(e) => setWhatsappText(e.target.value)}
                className="w-full h-80 p-8 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none"
              />
              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado!"); }}
                  className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-slate-800 transition-all"
                >
                  <FileText size={18} className="inline mr-2" /> Copiar
                </button>
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-emerald-700 transition-all text-center"
                >
                  <MessageSquare size={18} className="inline mr-2" /> Enviar WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
