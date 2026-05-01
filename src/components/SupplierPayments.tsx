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
  History
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
    } catch (e) { return []; }
  });

  const safeData = useMemo(() => ({
    supplierName: data?.supplierName || "FORNECEDOR N/I",
    ciNumber: data?.ciNumber || "N/E",
    contractTotal: Number(data?.contractTotal) || 0,
    currency: data?.currency || "USD",
    milestones: Array.isArray(data?.milestones) ? data.milestones.map((m: any) => ({
      ...m,
      id: m.id || Math.random().toString(36).substring(2, 9),
      date: m.date || new Date().toISOString().split('T')[0],
      amount: Number(m.amount || 0),
      percentage: Number(m.percentage || 0)
    })) : [],
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
    if (onUpdate && safeData) onUpdate(safeData);
  }, [safeData]);

  useEffect(() => {
    if (!exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => setExchangeRate(parseFloat(json.USDBRL.bid)))
        .catch(() => {});
    }
  }, []);

  const addMilestone = () => {
    const newMilestone: Milestone = {
      id: Math.random().toString(36).substring(2, 9),
      description: "Nova Parcela",
      percentage: 0,
      amount: 0,
      isPaid: false,
      date: new Date().toISOString().split('T')[0]
    };
    onUpdate({ ...safeData, milestones: [...safeData.milestones, newMilestone] });
  };

  const removeMilestone = (id: string) => {
    onUpdate({ ...safeData, milestones: safeData.milestones.filter((m: Milestone) => m.id !== id) });
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    onUpdate({
      ...safeData,
      milestones: safeData.milestones.map((m: Milestone) => m.id === id ? { ...m, ...updates } : m)
    });
  };

  const totalPaid = safeData.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = safeData.contractTotal - totalPaid;

  const saveRecord = async () => {
    setLoading(true);
    const recordId = safeData.ciNumber !== "N/E" ? safeData.ciNumber : `REC_${Date.now()}`;
    const dataToSave = { ...safeData, updatedAt: new Date().toISOString() };
    try {
      const newHistory = [ { id: recordId, dateSaved: new Date().toISOString(), data: dataToSave }, ...history.filter(h => h.id !== recordId) ];
      setHistory(newHistory);
      localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
      if (IS_SUPABASE_CONFIGURED) {
        await supabase.from('supplier_payments').upsert({ id: recordId, supplier_name: safeData.supplierName, ci_number: safeData.ciNumber, contract_total: safeData.contractTotal, data: dataToSave, updated_at: new Date().toISOString() });
        toast.success("Sincronizado na Nuvem!");
      } else {
        toast.success("Salvo Localmente!");
      }
    } catch (e) { toast.error("Erro ao salvar."); } finally { setLoading(false); }
  };

  const deleteHistoryRecord = (id: string) => {
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
    toast.success("Registro removido!");
  };

  const loadFromHistory = (h: any) => {
    if (onUpdate) onUpdate(h.data);
    setProductName(h.data.productName || "");
    setBankDetails(h.data.bankDetails || "");
    setRecipientName(h.data.recipientName || "Eveline");
    setExchangeRate(h.data.exchangeRate || 0);
    setProductImage(h.data.productImage || null);
    setBankImage(h.data.bankImage || null);
    toast.info(`Carregado: ${h.data.ciNumber}`);
  };

  const shareWhatsApp = () => {
    const etdDate = (() => {
      const d = new Date(orderDate + 'T12:00:00');
      d.setDate(d.getDate() + (Number(productionDays) || 0) + 10);
      return isNaN(d.getTime()) ? "N/E" : d.toLocaleDateString('pt-BR');
    })();
    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(safeData.ciNumber) || "Naoespecificado";
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${safeData.supplierName}\n\n${recipientName}, bom dia! 🏦 Gostaria de formalizar o pedido de lançamento de câmbio:\n\n📄 *DADOS DO PEDIDO:*\n• Ref: ${safeData.ciNumber}\n• Container: ${safeData.containerNumber}\n• Produto: ${safeData.productName}\n• Embarque: *${etdDate}* 🚢\n\n💰 *RESUMO FINANCEIRO:*\n` + "```" + `\nCONTRATO: ${safeData.currency} ${safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nCÂMBIO:    R$ ${safeData.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}\nTOTAL BRL: R$ ${(safeData.contractTotal * safeData.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` + "```" + `\n\n`;
    if (safeData.milestones.length > 0) {
      text += `📅 *PARCELAS:*\n` + "```" + `\n| DATA       | VALOR (${safeData.currency}) | %  |\n|------------|----------------|----|\n` + safeData.milestones.map(m => {
        const pct = ((m.amount / (safeData.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ');
        const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').padEnd(10);
        const val = m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14, ' ');
        return `| ${dt} | ${val} | ${pct}% |`;
      }).join('\n') + `\n` + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:*\n${bankDetails.substring(0, 150)}...\n\nFico no aguardo, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    setWhatsappText(text); setShowMsg(true);
  };

  const onDropProduct = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setProductImage(r.result as string); r.readAsDataURL(f[0]); }, []);
  const onDropBank = useCallback(async (f: File[]) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setBankImage(b); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setBankDetails(ex.bankDetails); toast.success("IA: Dados extraídos com sucesso!"); } catch (e) { toast.error("IA falhou."); } finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, []);
  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 bg-[#f8fafc] min-h-screen font-sans">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-900 rounded-[24px] flex items-center justify-center shadow-2xl shadow-slate-200">
            <DollarSign className="text-emerald-400" size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-500" /> Auditoria de Pagamentos Internacionais
            </p>
          </div>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button onClick={saveRecord} className="flex-1 md:flex-none px-10 py-5 bg-slate-900 text-white rounded-[24px] text-[11px] font-black uppercase hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 flex items-center justify-center gap-3 group">
            <Save size={20} className="group-hover:scale-110 transition-transform" /> {loading ? "Processando..." : "Salvar & Sincronizar"}
          </button>
          <button onClick={shareWhatsApp} className="flex-1 md:flex-none px-10 py-5 bg-emerald-500 text-white rounded-[24px] text-[11px] font-black uppercase hover:bg-emerald-600 transition-all shadow-2xl shadow-emerald-200 flex items-center justify-center gap-3 group">
            <MessageSquare size={20} className="group-hover:scale-110 transition-transform" /> Gerar WhatsApp
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
          {/* PAINEL DE UPLOAD DA INVOICE (DESTAQUE MÁXIMO) */}
          <div className="bg-white p-1 rounded-[40px] shadow-2xl shadow-blue-100 border border-blue-50 overflow-hidden">
            <div className="p-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[38px] text-white relative">
              <div className="absolute top-0 right-0 p-10 opacity-10"><Upload size={120} /></div>
              <div {...getBankRoot()} className="group relative border-4 border-dashed border-white/30 rounded-[32px] p-12 flex flex-col items-center justify-center cursor-pointer hover:border-white/60 hover:bg-white/5 transition-all">
                <input {...getBankInput()} />
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-6 shadow-2xl backdrop-blur-md group-hover:scale-110 transition-transform">
                  <FileDown size={36} className="text-white" />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Arraste sua Invoice Aqui</h3>
                <p className="text-xs font-bold opacity-70 uppercase tracking-widest text-center max-w-xs">A inteligência artificial extrairá os dados bancários e valores automaticamente.</p>
                {bankImage && <div className="mt-6 px-6 py-2 bg-emerald-500 rounded-full text-[10px] font-black uppercase flex items-center gap-2 animate-bounce"><CheckCircle size={14}/> Documento Identificado</div>}
              </div>
            </div>
          </div>

          {/* GESTÃO DE PARCELAS */}
          <div className="bg-white p-10 rounded-[56px] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-12">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center"><Calendar size={20} /></div>
                <h2 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em]">Cronograma de Pagamento</h2>
              </div>
              <button onClick={addMilestone} className="px-6 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center gap-3 text-[11px] font-black uppercase">
                <Plus size={18}/> Nova Parcela
              </button>
            </div>

            <div className="space-y-6">
              {safeData.milestones.length === 0 && (
                <div className="text-center py-20 bg-slate-50 rounded-[40px] border border-dashed border-slate-200">
                  <Clock className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma parcela cadastrada ainda.</p>
                </div>
              )}
              {safeData.milestones.map((m: Milestone) => (
                <div key={m.id} className="relative group p-8 bg-slate-50 rounded-[40px] border border-slate-100 hover:border-blue-300 hover:bg-white transition-all shadow-sm hover:shadow-2xl hover:shadow-blue-100/50">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Descrição</label>
                      <input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase focus:ring-4 ring-blue-500/10 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Vencimento</label>
                      <input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black focus:ring-4 ring-blue-500/10 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Valor ({safeData.currency})</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                        <input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-4 pl-10 bg-white border border-slate-200 rounded-2xl text-[12px] font-mono-technical font-black focus:ring-4 ring-blue-500/10 outline-none" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-6">
                      <button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-4 rounded-2xl text-[10px] font-black uppercase transition-all shadow-lg ${m.isPaid ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-white text-slate-400 border border-slate-200 hover:border-emerald-300'}`}>
                        {m.isPaid ? 'PAGO' : 'PENDENTE'}
                      </button>
                      <button onClick={() => removeMilestone(m.id)} className="w-12 h-12 bg-red-50 text-red-400 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                        <Trash2 size={20}/>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BARRA LATERAL DE AUDITORIA E HISTÓRICO */}
        <div className="lg:col-span-4 space-y-10">
          {/* CÁLCULOS */}
          <div className="calculation-box shadow-2xl shadow-emerald-200/50 p-10">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-8 border-b border-green-200/50 pb-4 flex items-center gap-2 text-green-900">
              <Calculator size={20} /> Resumo Financeiro
            </h3>
            <div className="space-y-8">
              <div className="space-y-2">
                <p className="text-[10px] opacity-60 uppercase font-black tracking-widest">Total do Contrato</p>
                <p className="text-4xl font-black tracking-tighter text-slate-900">{safeData.currency} {safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-6 bg-white/40 rounded-[32px] border border-green-200/50 backdrop-blur-sm">
                <p className="text-[10px] opacity-60 uppercase font-black mb-2">Conversão BRL (Taxa R$ {exchangeRate.toFixed(4)})</p>
                <p className="text-xl font-black text-green-900 font-mono-technical">R$ {(safeData.contractTotal * exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="pt-6 border-t border-green-200/50 space-y-4">
                <div className="flex justify-between text-[11px] font-black uppercase text-slate-600"><span>TOTAL LIQUIDADO:</span><span>{safeData.currency} {totalPaid.toLocaleString('pt-BR')}</span></div>
                <div className="flex justify-between text-2xl font-black text-green-900 uppercase"><span>SALDO EM ABERTO:</span><span>{safeData.currency} {balanceDue.toLocaleString('pt-BR')}</span></div>
                <div className="w-full h-4 bg-white/50 rounded-full overflow-hidden p-1 border border-green-200/50">
                  <div className="h-full bg-green-600 rounded-full transition-all duration-1000 shadow-xl" style={{ width: `${(totalPaid / (safeData.contractTotal || 1)) * 100}%` }}></div>
                </div>
                <p className="text-[9px] font-black text-center text-green-800 uppercase tracking-widest">Progresso: {((totalPaid / (safeData.contractTotal || 1)) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* DADOS BANCÁRIOS (TEXTO) */}
          <div className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Globe size={16} className="text-blue-500" /> Bank & Beneficiary</h3>
            <textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} className="w-full h-40 p-6 bg-slate-50 rounded-[32px] text-[11px] font-bold text-slate-600 border-none resize-none focus:bg-white focus:ring-4 ring-blue-500/5 transition-all shadow-inner" placeholder="Cole ou arraste a Invoice para preencher..." />
          </div>

          {/* HISTÓRICO GLOBAL (Onde os arquivos salvos aparecem) */}
          <div className="bg-white p-8 rounded-[48px] shadow-2xl shadow-slate-200/50 border border-slate-100">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-8 flex items-center justify-between">
              <div className="flex items-center gap-2"><History size={18} className="text-blue-600" /> Histórico Global</div>
              <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[9px]">{history.length} SALVOS</span>
            </h3>
            <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-3">
              {history.length === 0 && <p className="text-center py-10 text-[10px] font-bold text-slate-400 uppercase">Nenhum registro encontrado.</p>}
              {history.map((h: any) => (
                <div key={h.id} className="relative group p-5 bg-slate-50 rounded-[32px] border border-slate-100 hover:border-blue-400 hover:bg-white transition-all cursor-pointer shadow-sm hover:shadow-xl">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); deleteHistoryRecord(h.id); }} className="w-8 h-8 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><X size={14}/></button>
                  </div>
                  <div onClick={() => loadFromHistory(h)} className="space-y-2">
                    <div className="flex justify-between items-start pr-8">
                      <p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "S/ REF"}</p>
                      <p className="text-[8px] font-black text-slate-400">{new Date(h.dateSaved).toLocaleDateString()}</p>
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase truncate">{h.data?.supplierName}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] font-mono-technical font-black text-blue-600">{h.data?.currency} {Number(h.data?.contractTotal || 0).toLocaleString('pt-BR')}</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[8px] font-black uppercase">CARREGAR</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL WHATSAPP */}
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[56px] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-500 border border-white/20">
            <div className="bg-emerald-600 p-12 text-white flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-white/20 rounded-[28px] flex items-center justify-center backdrop-blur-xl shadow-2xl"><Zap size={40} /></div>
                <div><h3 className="text-3xl font-black uppercase tracking-tight">Pronto para Enviar</h3><p className="text-[11px] font-black opacity-70 uppercase tracking-[0.3em] mt-2">Renderização Monospace Técnica</p></div>
              </div>
              <button onClick={() => setShowMsg(false)} className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all text-3xl font-light">×</button>
            </div>
            <div className="p-12 bg-slate-50">
              <textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[450px] p-10 bg-slate-900 text-emerald-400 font-mono text-[12px] leading-relaxed rounded-[40px] border-none outline-none resize-none shadow-2xl custom-scrollbar" />
              <div className="flex gap-6 mt-10">
                <button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado!"); }} className="flex-1 py-6 bg-slate-900 text-white rounded-[28px] text-[11px] font-black uppercase hover:bg-slate-800 transition-all flex items-center justify-center gap-4 shadow-2xl"><FileText size={22} /> Copiar Mensagem</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-6 bg-emerald-600 text-white rounded-[28px] text-[11px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-4 shadow-2xl shadow-emerald-200"><MessageSquare size={22} /> Enviar WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
