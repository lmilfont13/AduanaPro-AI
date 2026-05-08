import React from 'react';
import { Layout, ExternalLink, FolderOpen, Star, Rocket, Zap, Clock, Search, ShieldCheck } from 'lucide-react';

const projects = [
  { id: 1, name: "neon-meteoroid", desc: "AduanaPro Premium - Inteligência Logística", tag: "Atual", color: "orange" },
  { id: 2, name: "chrono-copernicus", desc: "Gestão Temporal e Histórico", tag: "Archive", color: "blue" },
  { id: 3, name: "electric-cassini", desc: "Automação de Processos", tag: "Utility", color: "emerald" },
  { id: 4, name: "geradordedocs", desc: "Gerador de Documentos Siscomex", tag: "Essential", color: "rose" },
  { id: 5, name: "stellar-aphelion", desc: "Análise de Dados Estelares", tag: "Data", color: "indigo" },
  { id: 6, name: "shining-station", desc: "Interface de Controle", tag: "UI", color: "cyan" },
  { id: 7, name: "volatile-newton", desc: "Cálculos Complexos", tag: "Math", color: "amber" },
  { id: 8, name: "white-lagoon", desc: "Design Minimalista", tag: "Design", color: "slate" },
  { id: 9, name: "golden-intergalactic", desc: "Módulo Premium Financeiro", tag: "Finance", color: "yellow" },
  { id: 10, name: "nascent-exoplanet", desc: "Pesquisa e Desenvolvimento", tag: "R&D", color: "violet" },
];

export default function ProjectHub() {
  return (
    <div className="space-y-12 animate-in fade-in duration-1000">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 bg-white p-12 rounded-[56px] border border-slate-100 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 text-slate-900"><Rocket size={160} /></div>
        <div className="relative z-10 space-y-4">
           <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-slate-900 rounded-[22px] flex items-center justify-center text-white shadow-xl"><Layout size={28} /></div>
              <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">Meus Projetos <span className="text-orange-500">Antigravity</span></h2>
           </div>
           <p className="text-sm text-slate-400 font-bold uppercase tracking-[0.3em] pl-1">Ecossistema de Inteligência Mamoeiro</p>
        </div>
        <div className="flex items-center gap-4 relative z-10">
           <div className="px-8 py-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <Clock size={20} className="text-slate-400" />
              <span className="text-xs font-black text-slate-600 uppercase tracking-widest">26 Projetos Ativos</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map((p) => (
          <div key={p.id} className="group relative bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-3 transition-all duration-500 cursor-pointer overflow-hidden">
            <div className={`absolute top-0 left-0 w-2 h-full bg-${p.color}-500 opacity-0 group-hover:opacity-100 transition-all`} />
            <div className="space-y-6">
               <div className="flex justify-between items-start">
                  <div className={`w-14 h-14 rounded-2xl bg-${p.color}-50 flex items-center justify-center text-${p.color}-600 group-hover:bg-${p.color}-500 group-hover:text-white transition-all`}>
                     <FolderOpen size={24} />
                  </div>
                  <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-${p.color}-50 text-${p.color}-600`}>{p.tag}</span>
               </div>
               <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight group-hover:text-orange-600 transition-colors">{p.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed">{p.desc}</p>
               </div>
               <div className="pt-6 flex items-center justify-between border-t border-slate-50">
                  <div className="flex items-center gap-2">
                     <Star size={12} className="text-amber-400 fill-amber-400" />
                     <span className="text-[9px] font-black text-slate-400 uppercase">Premium</span>
                  </div>
                  <button className="flex items-center gap-2 text-[9px] font-black text-slate-900 uppercase group-hover:text-orange-600 transition-all">
                     Abrir Projeto <ExternalLink size={14} />
                  </button>
               </div>
            </div>
          </div>
        ))}
        
        {/* Placeholder for more projects */}
        <div className="p-10 rounded-[48px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-4 opacity-50 hover:opacity-100 transition-all group cursor-pointer">
           <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all"><Search size={24} /></div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ver outros 16 projetos</p>
        </div>
      </div>

      <div className="bg-[#0F172A] p-16 rounded-[64px] text-center space-y-8 relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500 via-transparent to-transparent" />
         <div className="relative z-10 space-y-4">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Central de Comando Mamoeiro</h3>
            <p className="text-slate-400 text-xs font-medium max-w-xl mx-auto leading-relaxed">Seus projetos estão sincronizados e seguros no diretório playground do Antigravity. Utilize este Hub para navegar entre suas criações de inteligência artificial.</p>
         </div>
         <div className="relative z-10 flex justify-center gap-6">
            <div className="flex items-center gap-2 px-6 py-3 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Zap size={14} className="text-yellow-400" /> Ultra Fast</div>
            <div className="flex items-center gap-2 px-6 py-3 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest"><ShieldCheck size={14} className="text-emerald-400" /> Secure</div>
         </div>
      </div>
    </div>
  );
}
