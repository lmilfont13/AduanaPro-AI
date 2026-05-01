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
  CloudOff,
  CloudUpload,
  RefreshCw,
  Calculator,
  FileSearch,
  Building2,
  Globe,
  User
} from 'lucide-react';
import jsPDF from 'jspdf';
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
  const [customLogo, setCustomLogo] = useState<string>(() => localStorage.getItem('ADUANAPRO_LOGO') || "");
  const [paymentTermsInput, setPaymentTermsInput] = useState(data?.paymentTerms || "");
  const [bankDetails, setBankDetails] = useState(data?.bankDetails || "");
  const [recipientName, setRecipientName] = useState(data?.recipientName || "Eveline");
  const [productName, setProductName] = useState(data?.productName || "");
  const [exchangeRate, setExchangeRate] = useState<number>(data?.exchangeRate || 0);
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
    supplierName: data?.supplierName || "",
    ciNumber: data?.ciNumber || "",
    contractTotal: Number(data?.contractTotal) || 0,
    currency: data?.currency || "USD",
    milestones: Array.isArray(data?.milestones) ? data.milestones : [],
    containerNumber: data?.containerNumber || "",
    exchangeRate: exchangeRate || 0,
    productName: productName || data?.productName || "",
    paymentTerms: paymentTermsInput || data?.paymentTerms || "",
    bankDetails: bankDetails || data?.bankDetails || "",
    recipientName: recipientName || "Eveline",
    orderDate,
    productionDays,
    productImage,
    bankImage
  }), [data, exchangeRate, productName, paymentTermsInput, bankDetails, recipientName, orderDate, productionDays, productImage, bankImage]);

  useEffect(() => {
    if (!exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => setExchangeRate(parseFloat(json.USDBRL.bid)))
        .catch(() => {});
    }
  }, []);

  const onDropProduct = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = () => setProductImage(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const onDropBank = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setBankImage(base64);
      setLoading(true);
      try {
        const text = await extractTextFromPDF(file);
        const extracted = await parsePaymentReceiptWithGroq(base64, file.type, text);
        if (extracted.bankDetails) setBankDetails(extracted.bankDetails);
        toast.success("Dados bancários extraídos!");
      } catch (e) {
        toast.error("Erro ao processar imagem bancária.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps: getProductRoot, getInputProps: getProductInput } = useDropzone({ onDrop: onDropProduct, accept: {'image/*': []}, multiple: false });
  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank, accept: {'image/*': [], 'application/pdf': []}, multiple: false });

  const totalPaid = safeData.milestones.filter(m => m.isPaid).reduce((acc, m) => acc + m.amount, 0);
  const balanceDue = safeData.contractTotal - totalPaid;

  const saveRecord = async () => {
    setLoading(true);
    const recordId = safeData.ciNumber || safeData.supplierName || Math.random().toString(36).substring(2,9);
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
        toast.success("Sincronizado com a Nuvem! ☁️");
      }
    } catch (e) {
      toast.error("Erro ao salvar registro.");
    } finally {
      setLoading(false);
    }
  };

  const shareWhatsApp = () => {
    const etdDate = (() => {
      const d = new Date(orderDate + 'T12:00:00');
      d.setDate(d.getDate() + (Number(productionDays) || 0) + 10);
      return isNaN(d.getTime()) ? "N/E" : d.toLocaleDateString('pt-BR');
    })();

    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(safeData.ciNumber) || "Naoespecificado";

    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO*\n${safeData.supplierName || "FORNECEDOR N/I"}\n\n` +
               `${recipientName}, bom dia! 🏦 Gostaria de formalizar o pedido de lançamento de câmbio conforme abaixo:\n\n` +
               `📄 *DADOS DO PEDIDO:*\n` +
               `• Ref. Pedido: ${safeData.ciNumber || "N/E"}\n` +
               `• Containers: ${safeData.containerNumber || "N/E"}\n` +
               `• Produto: ${safeData.productName || "N/I"}\n` +
               `• Previsão de Embarque: *${etdDate}* 🚢\n\n` +
               `💰 *RESUMO FINANCEIRO (AUDITADO):*\n` +
               "```" + `\n` +
               `CONTRATO TOTAL: ${safeData.currency} ${safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
               `CÂMBIO (BRL):  R$ ${safeData.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}\n` +
               `VALOR EM REAIS: R$ ${(safeData.contractTotal * safeData.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
               "```" + `\n\n`;

    if (safeData.milestones.length > 0) {
      text += `📅 *CRONOGRAMA DE PARCELAS:*\n` +
              "```" + `\n` +
              `| VENCIMENTO | VALOR (${safeData.currency}) | %  |\n` +
              `|------------|----------------|----|\n` +
              safeData.milestones.map(m => {
                const pct = ((m.amount / (safeData.contractTotal || 1)) * 100).toFixed(0).padStart(2, ' ');
                const dt = new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR').padEnd(10);
                const val = m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14, ' ');
                return `| ${dt} | ${val} | ${pct}% |`;
              }).join('\n') +
              `\n` + "```" + `\n\n`;
    }

    if (bankDetails) {
      text += `🏦 *DADOS BANCÁRIOS / OBSERVAÇÕES:*\n${bankDetails}\n\n`;
    }

    text += `Fico no aguardo do comprovante de pagamento, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    setWhatsappText(text);
    setShowMsg(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 bg-[#F8F9FC] min-h-screen font-sans">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* COLUNA ESQUERDA: FORMULÁRIO */}
        <div className="flex-1 space-y-8">
          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Supplier Payment Hub</h1>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Orquestração de Câmbio e Auditoria</p>
              </div>
              <div className="flex gap-2">
                <button onClick={saveRecord} className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200">
                  <Save size={14} /> Salvar Cloud
                </button>
                <button onClick={shareWhatsApp} className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-orange-600 transition-all shadow-lg shadow-orange-200">
                  <MessageSquare size={14} /> WhatsApp
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label>
                <input type="text" value={safeData.supplierName} readOnly className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-600" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ref. Pedido (CI)</label>
                <input type="text" value={safeData.ciNumber} readOnly className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-600" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto (Descrição)</label>
                <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 ring-blue-500/10" placeholder="Ex: Luvas de Nitrilo" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Containers / Referência</label>
                <input type="text" value={safeData.containerNumber} readOnly className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-600" />
              </div>
            </div>

            <div className="mt-8 p-6 bg-slate-50 rounded-[32px] border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Cronograma de Pagamento</h3>
              <div className="space-y-3">
                {safeData.milestones.map((m: Milestone) => (
                  <div key={m.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:border-blue-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                        {m.isPaid ? <CheckCircle size={18} /> : <Clock size={18} />}
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-700 uppercase">{m.description}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono-technical font-bold text-slate-800 tracking-tight">{safeData.currency} {m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[9px] font-black text-slate-300 uppercase">{m.percentage}% do contrato</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Foto do Produto</label>
              <div {...getProductRoot()} className="relative aspect-video rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer group overflow-hidden">
                <input {...getProductInput()} />
                {productImage ? (
                  <img src={productImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Produto" />
                ) : (
                  <div className="text-center">
                    <Upload size={32} className="mx-auto text-slate-300 mb-2" />
                    <span className="text-[9px] font-black text-slate-400 uppercase">Print do Produto</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Dados Bancários / Invoice</label>
              <div {...getBankRoot()} className="relative aspect-video rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer group overflow-hidden">
                <input {...getBankInput()} />
                {bankImage ? (
                  <img src={bankImage} className="w-full h-full object-cover" alt="Banco" />
                ) : (
                  <div className="text-center">
                    <Building2 size={32} className="mx-auto text-slate-300 mb-2" />
                    <span className="text-[9px] font-black text-slate-400 uppercase">Print da Conta</span>
                  </div>
                )}
              </div>
              <textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} className="w-full mt-4 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-600 border-none h-24 resize-none" placeholder="Dados bancários aparecerão aqui..." />
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: AUDITORIA */}
        <div className="w-full lg:w-[400px] space-y-6">
          <div className="calculation-box">
            <h3 className="text-[11px] font-black uppercase mb-4 tracking-tighter opacity-70">Memória de Cálculo Financeiro</h3>
            <div className="space-y-4">
              <div className="border-b border-green-200 pb-3">
                <p className="text-[9px] uppercase opacity-50 mb-1">Cálculo Aduaneiro (BRL)</p>
                <p className="text-[11px]">Contrato: {safeData.currency} {safeData.contractTotal.toLocaleString('pt-BR')}</p>
                <p className="text-[11px]">Câmbio: R$ {exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</p>
                <p className="text-sm font-bold mt-1">Total: R$ {(safeData.contractTotal * exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              
              <div className="border-b border-green-200 pb-3">
                <p className="text-[9px] uppercase opacity-50 mb-1">Encontro de Contas</p>
                <p className="text-[11px]">Total USD: {safeData.contractTotal.toLocaleString('pt-BR')}</p>
                <p className="text-[11px]">Liquidado: {totalPaid.toLocaleString('pt-BR')}</p>
                <div className="flex items-center justify-between mt-2 p-2 bg-white/40 rounded-lg">
                  <span className="text-[10px] font-black uppercase tracking-tighter">Saldo Remanescente</span>
                  <span className="text-base font-bold tracking-tighter">USD {balanceDue.toLocaleString('pt-BR')}</span>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase mb-2">
                  <span>Progresso do Pagamento</span>
                  <span>{((totalPaid / (safeData.contractTotal || 1)) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full h-3 bg-white/40 rounded-full overflow-hidden">
                  <div className="h-full bg-green-600 rounded-full" style={{ width: `${(totalPaid / (safeData.contractTotal || 1)) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FolderOpen size={14} className="text-blue-500" /> Histórico do Fornecedor
            </h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {history.map((h: any) => ( h.data.supplierName === safeData.supplierName && (
                <div key={h.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-300 transition-all cursor-pointer">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-slate-800">{h.data.ciNumber || "Sem CI"}</span>
                    <span className="text-[8px] font-bold text-slate-400">{new Date(h.dateSaved).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500">{h.data.productName || "Sem descrição"}</p>
                  <p className="text-[11px] font-mono-technical font-bold text-blue-600 mt-2">USD {h.data.contractTotal.toLocaleString('pt-BR')}</p>
                </div>
              )))}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL MENSAGEM WHATSAPP */}
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300 border border-white/20">
            <div className="bg-emerald-500 p-8 text-white">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Pronto para Enviar</h3>
                    <p className="text-xs font-bold text-emerald-100 uppercase tracking-widest">Formatação Profissional Ativada</p>
                  </div>
                </div>
                <button onClick={() => setShowMsg(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all text-xl font-bold">×</button>
              </div>
            </div>
            <div className="p-8">
              <textarea 
                value={whatsappText} 
                onChange={(e) => setWhatsappText(e.target.value)}
                className="w-full h-80 p-6 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-[32px] border-none outline-none resize-none shadow-inner custom-scrollbar"
              />
              <div className="flex gap-4 mt-6">
                <button 
                  onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success("Copiado!"); }}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <FileText size={16} /> Copiar Texto
                </button>
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 text-center"
                >
                  <MessageSquare size={16} /> Abrir WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
