import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileText,
  Ship,
  DollarSign,
  ShieldCheck,
  Bot,
  Hash,
  ArrowRightLeft,
  User,
  CheckCircle2,
  FileDown,
  Rocket,
  Truck
} from 'lucide-react';

// Importando serviços e tipos
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { parseDocumentWithGroq, compareDocumentsWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { DocumentData, ComparisonResult, SupplierPaymentData } from "../types";

// Importando componentes dos módulos
import FreightAuditor from './FreightAuditor';
import { SerialManager } from './SerialManager';
import { CustomsChat } from './CustomsChat';
import SupplierMatch from './SupplierMatch';
import SupplierPayments from './SupplierPayments';
import { LIGenerator } from './LIGenerator';
import FreightComparison from './FreightComparison';
import FreightBookingRequest from './FreightBookingRequest';
import ProjectHub from './ProjectHub';
import ArrivalSchedule from './ArrivalSchedule';

// --- MÓDULO AUDITORIA DOCS ---
const DocumentAuditor = ({ blData, setBlData, ciData, setCiData, plData, setPlData, aiEngine = "groq" }: any) => {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  const processFile = async (file: File, type: 'BL' | 'CI' | 'PL') => {
    setLoading(true);
    try {
      const text = await extractTextFromPDF(file);
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      
      const data = await parseDocumentWithGroq(base64, file.type, text);
      if (type === 'BL') setBlData(data);
      else if (type === 'CI') setCiData(data);
      else if (type === 'PL') setPlData(data);
      toast.success(`${type} carregado!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  };

  const { getRootProps: getRootBL, getInputProps: getInputBL } = useDropzone({ onDrop: (f) => processFile(f[0], 'BL') });
  const { getRootProps: getRootCI, getInputProps: getInputCI } = useDropzone({ onDrop: (f) => processFile(f[0], 'CI') });
  const { getRootProps: getRootPL, getInputProps: getInputPL } = useDropzone({ onDrop: (f) => processFile(f[0], 'PL') });

  const handleCompare = async () => {
    if (!blData || !ciData || !plData) { toast.error("Carregue BL, CI e PL primeiro."); return; }
    setLoading(true);
    try {
      const result = await compareDocumentsWithGroq(blData, ciData, plData);
      setComparison(result);
    } catch (error: any) { toast.error("Erro na comparação: " + error.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { type: 'BL', data: blData, label: 'Bill of Lading', root: getRootBL, input: getInputBL },
          { type: 'CI', data: ciData, label: 'Commercial Invoice', root: getRootCI, input: getInputCI },
          { type: 'PL', data: plData, label: 'Packing List', root: getRootPL, input: getInputPL }
        ].map((doc) => (
          <div key={doc.type} {...doc.root()} className={`group p-10 rounded-[48px] bg-white border-2 border-dashed transition-all cursor-pointer ${doc.data ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-orange-500 hover:bg-orange-50/10'}`}>
            <input {...doc.input()} />
            <div className="text-center space-y-4">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${doc.data ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
                {doc.data ? <CheckCircle2 size={32} /> : <FileText size={32} />}
              </div>
              <h3 className="font-black uppercase tracking-tight text-slate-800 text-xs">{doc.label}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{doc.data ? 'Carregado' : 'Arraste Aqui'}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center pt-8">
        <button 
          onClick={handleCompare}
          disabled={loading || !blData || !ciData || !plData}
          className="px-16 py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? 'Processando Auditoria...' : 'Iniciar Cruzamento de Dados'}
        </button>
      </div>

      {comparison && (
        <div className="bg-white p-12 rounded-[56px] border border-slate-100 shadow-2xl space-y-8 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-6 border-b border-slate-50 pb-8">
            <div className="w-14 h-14 bg-orange-500 rounded-[20px] flex items-center justify-center text-white shadow-xl shadow-orange-500/20"><ArrowRightLeft size={28} /></div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Inconsistências Encontradas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {comparison.discrepancies.map((d, i) => (
              <div key={i} className="p-8 rounded-[32px] bg-rose-50 border border-rose-100 flex gap-5">
                <AlertTriangle className="text-rose-500 shrink-0" size={28} />
                <div className="space-y-1">
                  <p className="font-black text-rose-900 uppercase text-[10px] tracking-widest">{d.field}</p>
                  <p className="text-sm text-rose-700 font-bold">{d.message}</p>
                </div>
              </div>
            ))}
          </div>
          {comparison.discrepancies.length === 0 && (
            <div className="p-10 text-center bg-emerald-50 rounded-[40px] border border-emerald-100 space-y-4">
              <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
              <h3 className="text-xl font-black text-emerald-900 uppercase">Documentos Sincronizados</h3>
              <p className="text-emerald-700 font-medium">Nenhuma divergência detectada pelo motor Groq.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE CARD DASHBOARD ---
const FeatureCard = ({ title, desc, icon, onClick }: any) => (
  <div onClick={onClick} className="group relative p-12 rounded-[56px] border border-slate-100 bg-white shadow-2xl cursor-pointer transition-all duration-500 hover:-translate-y-4">
    <div className="space-y-8 relative z-10">
      <div className="w-20 h-20 rounded-[28px] flex items-center justify-center bg-slate-50 text-slate-300 group-hover:bg-[#f97316] group-hover:text-white transition-all shadow-inner">{icon}</div>
      <div className="space-y-3">
        <h3 className="text-2xl font-black text-slate-800 uppercase leading-none">{title}</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{desc}</p>
      </div>
    </div>
  </div>
);

export default function AduanaDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [paymentData, setPaymentData] = useState<SupplierPaymentData>({
    supplierName: "", orderNumber: "", contractTotal: 0, currency: "USD", milestones: []
  });

  // Estado centralizado de documentos para compartilhar entre Auditoria e Gerador de LI
  const [blData, setBlData] = useState<DocumentData | null>(null);
  const [ciData, setCiData] = useState<DocumentData | null>(null);
  const [plData, setPlData] = useState<DocumentData | null>(null);

  const renderContent = () => {
    try {
      switch (activeTab) {
        case 'auditoria': return (
          <DocumentAuditor 
            blData={blData} setBlData={setBlData} 
            ciData={ciData} setCiData={setCiData} 
            plData={plData} setPlData={setPlData} 
            aiEngine="groq" 
          />
        );
        case 'frete': return <FreightAuditor aiEngine="groq" />;
        case 'seriais': return <SerialManager />;
        case 'chat': return <CustomsChat aiEngine="groq" />;
        case 'homologacao': return <SupplierMatch aiEngine="groq" />;
        case 'payments': return <SupplierPayments data={paymentData} onUpdate={setPaymentData} />;
        case 'li': return <LIGenerator aiEngine="groq" blData={blData} ciData={ciData} plData={plData} />;
        case 'comparativo': return <FreightBookingRequest />;
        case 'analise-frete': return <FreightComparison engine="groq" />;
        case 'hub': return <ProjectHub />;
        case 'expedicao': return <ArrivalSchedule />;
        default: return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <FeatureCard title="Auditoria Docs" desc="Cruzamento BL, CI e PL." icon={<FileText size={32} />} onClick={() => setActiveTab('auditoria')} />
            <FeatureCard title="Comparativo Frete" desc="Solicitação e Análise." icon={<Ship size={32} />} onClick={() => setActiveTab('comparativo')} />
            <FeatureCard title="Gerador de LI" desc="Rascunho Siscomex IA." icon={<FileDown size={32} />} onClick={() => setActiveTab('li')} />
            <FeatureCard title="Gestão Financeira" desc="Controle de pagamentos." icon={<DollarSign size={32} />} onClick={() => setActiveTab('payments')} />
            <FeatureCard title="Gerador Seriais" desc="Produção Cloud." icon={<Hash size={32} />} onClick={() => setActiveTab('seriais')} />
            <FeatureCard title="Aduana Chat" desc="Consultoria IA." icon={<Bot size={32} />} onClick={() => setActiveTab('chat')} />
            <FeatureCard title="Homologação" desc="Match de Fornecedores." icon={<ShieldCheck size={32} />} onClick={() => setActiveTab('homologacao')} />
            <FeatureCard title="Expedição" desc="Arrival Schedule." icon={<Truck size={32} />} onClick={() => setActiveTab('expedicao')} />
          </div>
        );
      }
    } catch (e: any) {
      return (
        <div className="p-20 text-center bg-white rounded-[56px] border border-rose-100 shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-rose-500 rounded-[28px] flex items-center justify-center text-white mx-auto shadow-xl"><AlertTriangle size={40} /></div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 uppercase">Ops! Algo deu errado.</h2>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">O módulo encontrou um erro inesperado.</p>
          </div>
          <button onClick={() => window.location.reload()} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">Reiniciar Interface</button>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex overflow-hidden font-sans">
      <aside className="w-80 bg-[#0F172A] flex flex-col h-screen shrink-0 shadow-2xl relative z-20">
        <div className="p-10 flex items-center gap-5 border-b border-white/5 bg-white/5">
          <div className="w-12 h-12 bg-[#f97316] rounded-2xl flex items-center justify-center text-white font-black text-xl">M</div>
          <div className="flex flex-col">
            <span className="font-black text-xl text-white uppercase leading-none">Mamoeiro</span>
            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-2">Intelligence</span>
          </div>
        </div>
        <nav className="flex-1 px-6 py-10 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
            { id: 'hub', label: 'Meus Projetos', icon: <Rocket size={20} className="text-orange-400" /> },
            { id: 'auditoria', label: 'Auditoria Docs', icon: <FileText size={20} /> },
            { id: 'comparativo', label: 'Solicitação Frete', icon: <Ship size={20} /> },
            { id: 'analise-frete', label: 'Comparativo Propostas', icon: <ArrowRightLeft size={20} /> },
            { id: 'frete', label: 'Auditoria Fatura', icon: <DollarSign size={20} /> },
            { id: 'li', label: 'Gerador de LI', icon: <FileDown size={20} /> },
            { id: 'payments', label: 'Gestão Financeira', icon: <DollarSign size={20} /> },
            { id: 'seriais', label: 'Gerador Seriais', icon: <Hash size={20} /> },
            { id: 'homologacao', label: 'Homologação', icon: <ShieldCheck size={20} /> },
            { id: 'expedicao', label: 'Expedição', icon: <Truck size={20} /> },
            { id: 'chat', label: 'Aduana Chat', icon: <Bot size={20} /> },
          ].map((item) => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id)} 
              className={`w-full flex items-center gap-4 px-6 py-5 rounded-[24px] font-black text-xs transition-all uppercase tracking-widest ${activeTab === item.id ? 'bg-[#f97316] text-white shadow-2xl' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-24 bg-white/80 backdrop-blur-xl border-b border-slate-200 flex items-center justify-between px-12 shrink-0">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Módulo: {activeTab.toUpperCase()}</h2>
          <div className="w-14 h-14 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center font-black shadow-xl">
            <User size={24} />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-16 custom-scrollbar bg-[#F8F9FC]">
          <div className="max-w-[1500px] mx-auto">
            {renderContent()}
          </div>
        </div>
      </main>
      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 5px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }` }} />
    </div>
  );
}
