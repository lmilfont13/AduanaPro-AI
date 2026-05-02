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
  Truck,
  RefreshCw
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
  const [view, setView] = useState<'desktop' | 'app'>('desktop');
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
        case 'expedicao': return <ArrivalSchedule />;
        default: return (
          <div className="relative h-full">
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

  if (view === 'desktop') {
    return (
      <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col font-sans">
        {/* Wallpaper Aesthetic */}
        <div className="absolute inset-0 z-0 opacity-40">
           <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600 blur-[150px] rounded-full" />
           <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600 blur-[150px] rounded-full" />
        </div>

        {/* Desktop Grid */}
        <div className="relative z-10 flex-1 p-10 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 grid-rows-6 gap-6">
           {/* Atalho Principal */}
           <div 
             onClick={() => setView('app')}
             className="flex flex-col items-center gap-3 p-6 rounded-[32px] hover:bg-white/10 transition-all cursor-pointer group w-fit h-fit"
           >
              <div className="w-20 h-20 bg-white rounded-[24px] shadow-2xl flex items-center justify-center text-orange-500 group-hover:scale-110 group-active:scale-95 transition-all">
                 <Rocket size={40} />
              </div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm group-hover:bg-orange-500 transition-all">AduanaPro AI</span>
           </div>

           {/* Outros Atalhos (Placeholders para o Hub) */}
           <div className="flex flex-col items-center gap-3 p-6 rounded-[32px] opacity-40 hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer group w-fit h-fit">
              <div className="w-20 h-20 bg-slate-800 rounded-[24px] flex items-center justify-center text-slate-500">
                 <LayoutDashboard size={40} />
              </div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Mamoeiro BI</span>
           </div>

           <div className="flex flex-col items-center gap-3 p-6 rounded-[32px] opacity-40 hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer group w-fit h-fit">
              <div className="w-20 h-20 bg-slate-800 rounded-[24px] flex items-center justify-center text-slate-500">
                 <Bot size={40} />
              </div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">IA Lab</span>
           </div>
        </div>

        {/* Taskbar bottom */}
        <div className="relative z-20 h-16 bg-black/60 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-10">
           <div className="flex items-center gap-6">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-orange-500/20">M</div>
              <div className="flex gap-2">
                 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white"><FileText size={16} /></div>
                 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white"><Ship size={16} /></div>
              </div>
           </div>
           <div className="flex items-center gap-6 text-white/60 font-black text-[9px] uppercase tracking-widest">
              <span className="text-orange-500 font-black px-2 py-0.5 bg-orange-500/10 rounded-md">v2.1-LATEST</span>
              <span>{new Date().toLocaleDateString('pt-BR')}</span>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span>Online</span>
           </div>
        </div>
      </div>
    );
  }

  const exportAllData = () => {
    const data: any = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('ADUANAPRO_')) {
        data[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AduanaPro_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success("Backup gerado! Agora use 'Importar' no outro link.");
  };

  const importAllData = (event: any) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = JSON.parse(e.target.result);
        Object.keys(data).forEach(key => {
          if (key.startsWith('ADUANAPRO_')) {
            localStorage.setItem(key, data[key]);
          }
        });
        toast.success("Dados restaurados! Reiniciando...");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        toast.error("Erro ao importar arquivo.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex overflow-hidden font-sans animate-in zoom-in-95 duration-500">
      <aside className="w-80 bg-[#0F172A] flex flex-col h-screen shrink-0 shadow-2xl relative z-20">
        <div className="p-10 flex items-center justify-between border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-[#f97316] rounded-2xl flex items-center justify-center text-white font-black text-xl">M</div>
            <div className="flex flex-col">
              <span className="font-black text-xl text-white uppercase leading-none">Mamoeiro</span>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-2">Intelligence</span>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-6 py-10 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
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
        
        <div className="px-6 py-4 border-t border-white/5 grid grid-cols-2 gap-2">
          <button onClick={exportAllData} className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 transition-all border border-white/5 group">
            <Rocket size={14} className="mb-1 text-orange-500" />
            <span className="text-[7px] font-black uppercase tracking-wider group-hover:text-white">Exportar</span>
          </button>
          <label className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 transition-all border border-white/5 cursor-pointer group">
            <FileDown size={14} className="mb-1 text-emerald-400" />
            <span className="text-[7px] font-black uppercase tracking-wider group-hover:text-white">Importar</span>
            <input type="file" className="hidden" accept=".json" onChange={importAllData} />
          </label>
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
                 <RefreshCw size={14} className="animate-spin-slow" />
              </div>
              <div className="flex flex-col">
                 <span className="text-[7px] font-black text-white/40 uppercase tracking-[2px]">Deploy Estável</span>
                 <span className="text-[9px] font-black text-white uppercase tracking-tighter">v2.6-MAY-01-23:18</span>
              </div>
           </div>
        </div>
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
