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
  Landmark
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
    productImage: data?.productImage || null as string | null,
    bankImage: data?.bankImage || null as string | null,
    milestones: (Array.isArray(data?.milestones) ? data.milestones : []).map((m: any) => ({
      ...m,
      id: m.id || Math.random().toString(36).substring(2, 9),
      amount: Number(m.amount || 0),
      percentage: Number(m.percentage || 0)
    })) as Milestone[]
  });

  useEffect(() => {
    if (onUpdate) onUpdate(form);
  }, [form]);

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
    const newM: Milestone = {
      id: Math.random().toString(36).substring(2, 9),
      description: "Nova Parcela",
      percentage: 0,
      amount: 0,
      isPaid: false,
      date: new Date().toISOString().split('T')[0]
    };
    setForm(prev => ({ ...prev, milestones: [...prev.milestones, newM] }));
  };

  const removeMilestone = (id: string) => {
    setForm(prev => ({ ...prev, milestones: prev.milestones.filter(m => m.id !== id) }));
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setForm(prev => ({
      ...prev,
      milestones: prev.milestones.map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

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
        toast.success("Sincronizado Cloud!");
      }
    } catch (e) { toast.error("Erro ao salvar."); } finally { setLoading(false); }
  };

  const loadFromHistory = (h: any) => { setForm({ ...h.data }); toast.info(`Carregado: ${h.data.ciNumber}`); };

  const shareWhatsApp = () => {
    const etdDate = (() => {
      const d = new Date(form.orderDate + 'T12:00:00');
      d.setDate(d.getDate() + (Number(form.productionDays) || 0) + 10);
      return isNaN(d.getTime()) ? "N/E" : d.toLocaleDateString('pt-BR');
    })();
    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(form.ciNumber) || "Naoespecificado";
    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${form.supplierName}\n\n${form.recipientName}, bom dia! 🏦 Gostaria de formalizar o pedido de lançamento de câmbio:\n\n📄 *DADOS DO PEDIDO:*\n• Ref: ${form.ciNumber}\n• Container: ${form.containerNumber}\n• Produto: ${form.productName}\n• Embarque: *${etdDate}* 🚢\n\n💰 *RESUMO FINANCEIRO:*\n` + "```" + `\nCONTRATO: ${form.currency} ${form.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nCÂMBIO:    R$ ${form.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}\nTOTAL BRL: R$ ${(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` + "```" + `\n\n`;
    if (form.milestones.length > 0) {
      text += `📅 *PARCELAS:*\n` + "```" + `\n| DATA       | VALOR (${form.currency}) | %  |\n|------------|----------------|----|\n` + form.milestones.map(m => {
        const pct = ((m.amount / (form.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ');
        const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').padEnd(10);
        const val = m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14, ' ');
        return `| ${dt} | ${val} | ${pct}% |`;
      }).join('\n') + `\n` + "```" + `\n\n`;
    }
    text += `🏦 *BANCO:*\n${form.bankDetails.substring(0, 150)}...\n\nFico no aguardo, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    setWhatsappText(text); setShowMsg(true);
  };

  const onDropProduct = useCallback((f: File[]) => { const r = new FileReader(); r.onload = () => setForm(prev => ({ ...prev, productImage: r.result as string })); r.readAsDataURL(f[0]); }, []);
  const onDropBank = useCallback(async (f: File[]) => { const r = new FileReader(); r.onload = async () => { const b = r.result as string; setForm(prev => ({ ...prev, bankImage: b })); setLoading(true); try { const t = await extractTextFromPDF(f[0]); const ex = await parsePaymentReceiptWithGroq(b, f[0].type, t); if (ex.bankDetails) setForm(prev => ({ ...prev, bankDetails: ex.bankDetails })); toast.success("IA: Dados bancários auditados!"); } catch (e) { toast.error("IA falhou."); } finally { setLoading(false); } }; r.readAsDataURL(f[0]); }, []);
  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 bg-[#f8fafc] min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200">
            <DollarSign className="text-emerald-400" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Gestão Financeira</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">Audit & Cloud Synchronization</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={saveRecord} className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center gap-2"><Save size={18}/> {loading ? "Salvando..." : "Salvar Cloud"}</button>
          <button onClick={shareWhatsApp} className="px-8 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-2"><MessageSquare size={18}/> WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          
          {/* SEÇÃO DE EVIDÊNCIAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={14} className="text-blue-500" /> Invoice / Proforma</h3>
              <div {...getBankRoot()} className="w-full h-40 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all overflow-hidden group">
                <input {...getBankInput()} />
                {form.bankImage ? <img src={form.bankImage} className="w-full h-full object-cover" /> : (
                  <div className="text-center"><FileDown className="mx-auto text-slate-300 mb-2" size={32}/><p className="text-[9px] font-black text-slate-400 uppercase">Arraste a Invoice</p></div>
                )}
              </div>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={14} className="text-emerald-500" /> Foto do Produto</h3>
              <div {...getProductRoot()} className="w-full h-40 border-2 border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all overflow-hidden group">
                <input {...getProductInput()} />
                {form.productImage ? <img src={form.productImage} className="w-full h-full object-cover" /> : (
                  <div className="text-center"><Zap className="mx-auto text-slate-300 mb-2" size={32}/><p className="text-[9px] font-black text-slate-400 uppercase">Snap do Produto</p></div>
                )}
              </div>
            </div>
          </div>

          {/* DADOS DO CONTRATO E BANCÁRIOS (UNIFICADOS NO CENTRO) */}
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-8">
            <div>
              <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-6 flex items-center gap-2"><LayoutGrid size={16} /> Divisão do Contrato</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Fornecedor</label><input type="text" value={form.supplierName} onChange={(e) => setForm(prev => ({ ...prev, supplierName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase outline-none" /></div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Produto</label><input type="text" value={form.productName} onChange={(e) => setForm(prev => ({ ...prev, productName: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase outline-none" /></div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Ref. Invoice</label><input type="text" value={form.ciNumber} onChange={(e) => setForm(prev => ({ ...prev, ciNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase outline-none" /></div>
                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Container</label><input type="text" value={form.containerNumber} onChange={(e) => setForm(prev => ({ ...prev, containerNumber: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl text-[11px] font-black uppercase outline-none" /></div>
                  </div>
                  <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor Total ({form.currency})</label><input type="number" value={form.contractTotal} onChange={(e) => setForm(prev => ({ ...prev, contractTotal: Number(e.target.value) }))} className="w-full p-4 bg-slate-900 text-emerald-400 rounded-2xl text-[14px] font-black font-mono-technical outline-none" /></div>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100">
              <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-6 flex items-center gap-2"><Landmark size={16} /> Dados Bancários (Beneficiary)</h2>
              <textarea 
                value={form.bankDetails} 
                onChange={(e) => setForm(prev => ({ ...prev, bankDetails: e.target.value }))} 
                className="w-full h-40 p-6 bg-slate-50 rounded-[32px] text-[11px] font-bold text-slate-600 border-none resize-none focus:bg-white focus:ring-4 ring-emerald-500/5 transition-all shadow-inner font-mono" 
                placeholder="Dados bancários completos (extraídos via IA ou manuais)..."
              />
            </div>
          </div>

          {/* CRONOGRAMA DE PARCELAS */}
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Cronograma Financeiro</h2>
              <button onClick={addMilestone} className="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 text-[10px] font-black uppercase shadow-lg shadow-blue-100">
                <Plus size={16}/> Add Parcela
              </button>
            </div>
            <div className="space-y-4">
              {form.milestones.map((m: Milestone) => (
                <div key={m.id} className="p-5 bg-slate-50 rounded-[28px] border border-slate-100 hover:border-blue-300 transition-all">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase block ml-1">Fase</label>
                      <input type="text" value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-[10px] font-black uppercase outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase block ml-1">Data</label>
                      <input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-[10px] font-black" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase block ml-1">Valor</label>
                      <input type="number" value={m.amount} onChange={(e) => updateMilestone(m.id, { amount: Number(e.target.value) })} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-[11px] font-mono-technical font-black" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex-1 p-3 rounded-xl text-[9px] font-black uppercase transition-all ${m.isPaid ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>
                        {m.isPaid ? 'PAGO' : 'PENDENTE'}
                      </button>
                      <button onClick={() => removeMilestone(m.id)} className="w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500 transition-all"><Trash2 size={16}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LATERAL DIREITA */}
        <div className="lg:col-span-4 space-y-8">
          <div className="calculation-box p-8 shadow-xl shadow-emerald-100 border border-green-200/50">
            <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 flex items-center gap-2 text-green-900 border-b border-green-200/50 pb-4">
              <Calculator size={18} /> Auditoria Financeira
            </h3>
            <div className="space-y-6">
              <div className="p-6 bg-white/40 rounded-[32px] border border-green-200/50">
                <p className="text-[9px] opacity-60 uppercase font-black mb-1">Câmbio R$ {form.exchangeRate.toFixed(4)}</p>
                <p className="text-xl font-black text-green-900 font-mono-technical">R$ {(form.contractTotal * form.exchangeRate).toLocaleString('pt-BR')}</p>
                <p className="text-[10px] opacity-60 uppercase font-black mt-4 mb-1">Saldo em Aberto</p>
                <p className="text-2xl font-black text-green-900 font-mono-technical">{form.currency} {balanceDue.toLocaleString('pt-BR')}</p>
              </div>
              <div className="w-full h-3 bg-white/50 rounded-full overflow-hidden p-0.5">
                <div className="h-full bg-green-600 rounded-full transition-all duration-1000 shadow-xl" style={{ width: `${(totalPaid / (form.contractTotal || 1)) * 100}%` }}></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={16} className="text-blue-500" /> Histórico Global</h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
              {history.map((h: any) => (
                <div key={h.id} onClick={() => loadFromHistory(h)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-400 hover:bg-white transition-all group relative cursor-pointer">
                  <p className="text-[10px] font-black text-slate-900 uppercase truncate">{h.data?.ciNumber || "S/ REF"}</p>
                  <p className="text-[9px] font-bold text-slate-500 truncate">{h.data?.supplierName}</p>
                  <p className="text-[11px] font-mono-technical font-black text-blue-600 mt-1">{h.data?.currency} {Number(h.data?.contractTotal || 0).toLocaleString('pt-BR')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* WHATSAPP MODAL */}
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-500">
            <div className="bg-emerald-600 p-8 text-white flex justify-between items-center font-black uppercase tracking-tight">Template WhatsApp <button onClick={() => setShowMsg(false)} className="text-2xl font-light">×</button></div>
            <div className="p-8 bg-slate-50">
              <textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} className="w-full h-[400px] p-8 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none" />
              <div className="flex gap-4 mt-6">
                <button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado!"); }} className="flex-1 py-5 bg-slate-900 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-slate-800 transition-all">Copiar</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase hover:bg-emerald-700 transition-all text-center">Enviar WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
