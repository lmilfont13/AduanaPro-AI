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
    const saved = localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY');
    return saved ? JSON.parse(saved) : [];
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

  // Sincronizar com o pai
  useEffect(() => {
    if (onUpdate) onUpdate(safeData);
  }, [safeData]);

  useEffect(() => {
    if (!exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => setExchangeRate(parseFloat(json.USDBRL.bid)))
        .catch(() => {});
    }
  }, []);

  const totalPaid = safeData.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = safeData.contractTotal - totalPaid;

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
        if (extracted.bankDetails) setBankDetails(extracted.bankDetails);
        toast.success("Dados bancários auditados via IA!");
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
      const d = new Date(orderDate + 'T12:00:00');
      d.setDate(d.getDate() + (Number(productionDays) || 0) + 10);
      return isNaN(d.getTime()) ? "N/E" : d.toLocaleDateString('pt-BR');
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
               `CONTRATO: ${safeData.currency} ${safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
               `CÂMBIO:    R$ ${safeData.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}\n` +
               `TOTAL BRL: R$ ${(safeData.contractTotal * safeData.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
               "```" + `\n\n`;

    if (safeData.milestones.length > 0) {
      text += `📅 *PARCELAS:*\n` +
              "```" + `\n` +
              `| DATA       | VALOR (${safeData.currency}) | %  |\n` +
              `|------------|----------------|----|\n` +
              safeData.milestones.map(m => {
                const pct = ((m.amount / (safeData.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ');
                const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').padEnd(10);
                const val = m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14, ' ');
                return `| ${dt} | ${val} | ${pct}% |`;
              }).join('\n') +
              `\n` + "```" + `\n\n`;
    }

    text += `🏦 *BANCO:*\n${bankDetails.substring(0, 150)}...\n\n` +
            `Fico no aguardo, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    setWhatsappText(text);
    setShowMsg(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 bg-[#f8fafc] min-h-screen">
      {/* HEADER PREMIUM */}
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
            <Save size={16} className="group-hover:scale-110 transition-transform" /> {loading ? "Sincronizando..." : "Sincronizar Cloud"}
          </button>
          <button onClick={shareWhatsApp} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200 group">
            <MessageSquare size={16} className="group-hover:scale-110 transition-transform" /> WhatsApp
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* COLUNA DADOS PRINCIPAIS */}
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50/50 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
            
            <div className="relative">
              <div className="flex items-center gap-2 mb-8">
                <span className="w-8 h-[2px] bg-emerald-500"></span>
                <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em]">Detalhes da Operação</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="group">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Fornecedor Exportador</label>
                    <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3 group-hover:bg-white group-hover:border-emerald-200 transition-all">
                      <Building2 className="text-slate-300" size={18} />
                      <span className="text-xs font-black text-slate-700 uppercase">{safeData.supplierName}</span>
                    </div>
                  </div>
                  <div className="group">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Descrição Comercial do Produto</label>
                    <input 
                      type="text" 
                      value={productName} 
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full p-5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all uppercase" 
                      placeholder="Identifique o produto para o câmbio..."
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Ref. Pedido</label>
                      <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData.ciNumber}</div>
                    </div>
                    <div className="group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Container</label>
                      <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black text-slate-700 uppercase">{safeData.containerNumber}</div>
                    </div>
                  </div>
                  <div className="group">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Responsável Financeiro</label>
                    <div className="relative">
                      <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="text" 
                        value={recipientName} 
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CRONOGRAMA DE PAGAMENTO */}
          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-2">
                <span className="w-8 h-[2px] bg-blue-500"></span>
                <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">Cronograma de Parcelas</h2>
              </div>
              <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest">
                {safeData.milestones.length} Parcelas Identificadas
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {safeData.milestones.map((m: Milestone) => (
                <div key={m.id} className="relative group p-6 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-blue-400 hover:bg-white transition-all shadow-sm hover:shadow-xl hover:shadow-blue-100/50">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 shadow-sm'}`}>
                      {m.isPaid ? <CheckCircle size={22} /> : <Clock size={22} />}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vencimento</p>
                      <p className="text-xs font-black text-slate-700">{new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight mb-1">{m.description}</h4>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-mono-technical font-black text-slate-900">{safeData.currency} {m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg uppercase">{m.percentage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA AUDITORIA E CALCULOS */}
        <div className="lg:col-span-4 space-y-8">
          {/* MEMÓRIA DE CÁLCULO PREMIUM */}
          <div className="calculation-box shadow-2xl shadow-emerald-200/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Calculator size={80} />
            </div>
            
            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-8 border-b border-green-200/50 pb-4 flex items-center gap-2">
              <ShieldCheck size={18} /> Financial Audit Memory
            </h3>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] opacity-60 uppercase font-black">
                  <span>Valor do Contrato</span>
                  <span>{safeData.currency}</span>
                </div>
                <div className="text-3xl font-black tracking-tighter">
                  {safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-4 bg-white/40 rounded-2xl space-y-2 border border-green-200/50">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="opacity-60 uppercase">Câmbio Estimado</span>
                  <span className="font-mono">R$ {exchangeRate.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="opacity-60 uppercase">Conversão BRL</span>
                  <span className="text-sm font-black">R$ {(safeData.contractTotal * exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-green-200/50">
                <div className="flex justify-between items-center text-[10px] font-black uppercase">
                  <span>Encontro de Contas</span>
                  <span className="bg-green-600 text-white px-2 py-0.5 rounded text-[8px]">Live Data</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="opacity-60">TOTAL LIQUIDADO:</span>
                    <span>{safeData.currency} {totalPaid.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between text-lg font-black text-green-900">
                    <span>SALDO DEVEDOR:</span>
                    <span>{safeData.currency} {balanceDue.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                
                <div className="pt-2">
                  <div className="w-full h-3 bg-white/50 rounded-full overflow-hidden p-0.5 border border-green-200/50">
                    <div 
                      className="h-full bg-green-600 rounded-full transition-all duration-1000 shadow-sm" 
                      style={{ width: `${(totalPaid / (safeData.contractTotal || 1)) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-[9px] font-black text-center mt-2 uppercase tracking-widest opacity-60">
                    Fluxo de Liquidação: {((totalPaid / (safeData.contractTotal || 1)) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* UPLOAD DE EVIDÊNCIAS */}
          <div className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-500" /> Digital Assets & Evidence
            </h3>
            
            <div className="space-y-6">
              <div {...getProductRoot()} className="group relative aspect-[16/9] rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all overflow-hidden">
                <input {...getProductInput()} />
                {productImage ? (
                  <img src={productImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Evidence" />
                ) : (
                  <div className="text-center p-6">
                    <Zap className="mx-auto text-slate-300 mb-3 group-hover:text-emerald-500 transition-colors" size={32} />
                    <p className="text-[9px] font-black text-slate-400 uppercase">Snapshot do Produto</p>
                  </div>
                )}
              </div>

              <div {...getBankRoot()} className="group relative p-6 rounded-3xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-emerald-400 transition-all cursor-pointer">
                <input {...getBankInput()} />
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-400 group-hover:text-emerald-500 transition-colors">
                    <Building2 size={24} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bank Details</p>
                    <p className="text-[10px] font-bold text-slate-700 truncate">{bankImage ? "Documento Carregado" : "Arraste a Invoice aqui"}</p>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              <textarea 
                value={bankDetails} 
                onChange={(e) => setBankDetails(e.target.value)}
                className="w-full h-32 p-5 bg-slate-50 rounded-3xl text-[10px] font-bold text-slate-600 border-none resize-none focus:bg-white transition-all shadow-inner"
                placeholder="Dados bancários extraídos aparecerão aqui..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* WHATSAPP MODAL PREMIUM */}
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[56px] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-500 border border-white/20">
            <div className="bg-emerald-600 p-10 text-white relative">
              <div className="absolute top-0 right-0 p-10 opacity-10">
                <MessageSquare size={120} />
              </div>
              <div className="flex justify-between items-center relative">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-white/20 rounded-[24px] flex items-center justify-center backdrop-blur-xl">
                    <Zap size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Smart Message</h3>
                    <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.3em] mt-2">Monospace technical rendering active</p>
                  </div>
                </div>
                <button onClick={() => setShowMsg(false)} className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all text-2xl font-light">×</button>
              </div>
            </div>
            <div className="p-10 bg-slate-50">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-[32px] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <textarea 
                  value={whatsappText} 
                  onChange={(e) => setWhatsappText(e.target.value)}
                  className="relative w-full h-96 p-8 bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed rounded-[32px] border-none outline-none resize-none shadow-2xl custom-scrollbar"
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado com Sucesso!"); }}
                  className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl"
                >
                  <FileText size={18} /> Copiar Área de Transferência
                </button>
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-200"
                >
                  <MessageSquare size={18} /> Disparar para WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
