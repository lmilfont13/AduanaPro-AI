import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Hash, 
  Search, 
  Trash2, 
  RefreshCw, 
  Plus, 
  CheckSquare, 
  Square, 
  Database, 
  Settings2, 
  Calendar, 
  ArrowRight,
  FileDown,
  ChevronDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

interface SerialBatch {
  id: string;
  created_at?: string;
  product_name?: string;
  voltage?: string;
  quantity?: number;
  start_serial?: number;
  end_serial?: number;
  serials_list?: string[];
  pattern?: string;
}

export const SerialManager = React.memo(() => {
  const [batches, setBatches] = useState<SerialBatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [newProduct, setNewProduct] = useState("");
  const [newVoltage, setNewVoltage] = useState("220V");
  const [newQty, setNewQty] = useState(10);
  
  const now = new Date();
  const [customMonth, setCustomMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [customYear, setCustomYear] = useState(now.getFullYear().toString());

  const normalizeBatch = (item: any): SerialBatch => ({
    ...item,
    id: item.id?.toString() || Math.random().toString(36).substr(2, 9),
    product_name: item.product_name || item.product || item.nome || 'Sem Nome',
    quantity: Number(item.quantity || 0),
    voltage: item.voltage || 'N/A',
    start_serial: Number(item.start_serial || 0),
    end_serial: Number(item.end_serial || 0),
    serials_list: Array.isArray(item.serials_list) ? item.serials_list : [],
    created_at: item.created_at || new Date().toISOString()
  });

   const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Busca do Supabase
      const { data: supabaseData, error: sbError } = await supabase
        .from('serials')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (sbError) {
        console.warn("Supabase Error:", sbError);
      }

      // 2. Busca do LocalStorage (Backup)
      const localData = JSON.parse(localStorage.getItem('aduana_serials_backup') || '[]');
      
      // 3. Normalização e Merge
      const allRaw = [...(supabaseData || []), ...(localData || [])];
      const uniqueMap = new Map();

      allRaw.forEach(item => {
        const normalized = normalizeBatch(item);
        // Usar o ID real se existir, senão gera um baseado no conteúdo para evitar duplicatas
        const key = item.id || `${normalized.product_name}-${normalized.start_serial}-${normalized.created_at}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, { ...normalized, id: key });
        }
      });

      const sorted = Array.from(uniqueMap.values()).sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      setBatches(sorted);
      if (sorted.length > 0) {
        localStorage.setItem('aduana_serials_backup', JSON.stringify(sorted.slice(0, 50))); // Mantém backup local dos últimos 50
      }
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Erro ao recompor histórico.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const previewSerial = useMemo(() => {
    const month = customMonth;
    const year = customYear.slice(-2);
    const product = newProduct || "XXXX";
    const volt = newVoltage === "220V" ? "2" : "1";
    return `${product}-${volt}${month}${year}-0001`;
  }, [newProduct, newVoltage, customMonth, customYear]);

  const generateAndSave = async () => {
    if (!newProduct) {
      toast.error("Informe o nome do produto.");
      return;
    }

    setIsLoading(true);
    try {
      const month = customMonth;
      const year = customYear.slice(-2);
      const voltCode = newVoltage === "220V" ? "2" : "1";
      
      // Encontrar o último serial para este padrão no banco ou local
      const pattern = `${newProduct}-${voltCode}${month}${year}-`;
      const samePatternBatches = batches.filter(b => b.product_name === newProduct && b.voltage === newVoltage && b.pattern === pattern);
      
      let nextNum = 1;
      if (samePatternBatches.length > 0) {
        const lastBatch = samePatternBatches[0]; // Batches já estão ordenados por data
        nextNum = (lastBatch.end_serial || 0) + 1;
      }

      const startSerial = nextNum;
      const endSerial = nextNum + newQty - 1;
      const serialsList = Array.from({ length: newQty }, (_, i) => `${pattern}${(startSerial + i).toString().padStart(4, '0')}`);

      const newBatch: SerialBatch = {
        id: Math.random().toString(36).substr(2, 9),
        product_name: newProduct,
        voltage: newVoltage,
        quantity: newQty,
        start_serial: startSerial,
        end_serial: endSerial,
        serials_list: serialsList,
        pattern: pattern,
        created_at: new Date().toISOString()
      };

      // Salvar no Supabase
      const { error: sbError } = await supabase.from('serials').insert([newBatch]);
      
      if (sbError) {
        console.warn("Falha ao salvar no Supabase, mantendo local:", sbError);
        toast.warning("Salvo apenas localmente (erro na nuvem)");
      } else {
        toast.success("Lote gerado e sincronizado!");
      }

      // Atualizar estado e local
      const updatedBatches = [newBatch, ...batches];
      setBatches(updatedBatches);
      localStorage.setItem('aduana_serials_backup', JSON.stringify(updatedBatches.slice(0, 50)));
      
    } catch (err: any) {
      toast.error("Erro ao gerar lote: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBatch = async (id: string) => {
    if (!confirm("Deseja realmente excluir este lote?")) return;

    try {
      const { error } = await supabase.from('serials').delete().eq('id', id);
      if (error) throw error;

      const updated = batches.filter(b => b.id !== id);
      setBatches(updated);
      localStorage.setItem('aduana_serials_backup', JSON.stringify(updated.slice(0, 50)));
      toast.success("Lote excluído.");
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const exportSerialsData = () => {
    const dataToExport = {
      batches: batches,
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AduanaPro_Serials_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success("Backup de seriais exportado!");
  };

  const importSerialsData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.batches) {
          setBatches(data.batches);
          localStorage.setItem('aduana_serials_backup', JSON.stringify(data.batches));
          toast.success("Backup de seriais importado com sucesso!");
        }
      } catch (err) {
        toast.error("Erro ao importar backup de seriais.");
      }
    };
    reader.readAsText(file);
  };

  const exportSelectedPDF = () => {
    const selectedBatches = batches.filter(b => selectedIds.includes(b.id));
    if (selectedBatches.length === 0) return;

    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(18);
    doc.text("Relatório de Produção - Mamoeiro Intelligence", 105, y, { align: 'center' });
    y += 15;

    selectedBatches.forEach((batch, idx) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`Lote: ${batch.product_name} - ${batch.voltage}`, 20, y);
      y += 7;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Quantidade: ${batch.quantity} | Início: ${batch.start_serial} | Fim: ${batch.end_serial}`, 20, y);
      y += 5;
      doc.text(`Data: ${new Date(batch.created_at || '').toLocaleDateString('pt-BR')}`, 20, y);
      y += 10;

      // Listar seriais em colunas
      const serials = batch.serials_list || [];
      let x = 20;
      serials.forEach((s, sIdx) => {
        doc.text(s, x, y);
        x += 45;
        if (x > 180) {
          x = 20;
          y += 5;
        }
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
      });
      
      y += 15;
      doc.setDrawColor(200);
      doc.line(20, y - 5, 190, y - 5);
    });

    doc.save(`seriais-mamoeiro-${new Date().getTime()}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 p-4 lg:p-10 animate-in fade-in duration-500">
      {/* ... (Header remains similar) */}
      <div className="bg-[#0F172A] p-10 rounded-[48px] text-white flex justify-between items-center shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-10 opacity-5"><Database size={160} /></div>
         <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 bg-indigo-500 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/20"><Hash size={32} /></div>
            <div>
               <h2 className="text-3xl font-black uppercase tracking-tighter">Seriais <span className="text-indigo-400">Cloud</span></h2>
               <p className="text-indigo-300/50 text-[9px] font-black uppercase tracking-[3px]">Histórico e Produção em Tempo Real</p>
            </div>
         </div>
         <div className="flex items-center gap-4 relative z-10">
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 mr-2">
              <button onClick={exportSerialsData} className="px-4 py-2 text-white/60 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 hover:text-white transition-all">
                Exportar
              </button>
              <label className="px-4 py-2 text-white/60 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 hover:text-white transition-all cursor-pointer">
                Importar
                <input type="file" className="hidden" accept=".json" onChange={importSerialsData} />
              </label>
            </div>
            {selectedIds.length > 0 && (
              <button onClick={exportSelectedPDF} className="px-8 py-4 bg-indigo-500 text-white rounded-[20px] font-black uppercase text-[10px] shadow-2xl hover:bg-indigo-400 transition-all flex items-center gap-3">
                <FileDown size={18} /> Exportar Selecionados ({selectedIds.length})
              </button>
            )}
            <button onClick={fetchBatches} className={`p-5 bg-white/10 rounded-[20px] hover:bg-white/20 transition-all ${isLoading ? 'animate-pulse' : ''}`}>
               <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Form Column */}
        <div className="lg:col-span-4 space-y-8">
           <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl space-y-8">
              <h3 className="text-xl font-black text-slate-800 uppercase flex items-center gap-3"><Settings2 size={20} className="text-indigo-500" /> Gerar Novo Lote</h3>
              <div className="space-y-6">
                 <div className="p-6 bg-slate-50 rounded-[32px] space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Mês</label>
                          <select value={customMonth} onChange={(e) => setCustomMonth(e.target.value)} className="w-full p-4 bg-white rounded-2xl font-black text-xs outline-none border border-slate-100">{Array.from({length: 12}, (_, i) => (i+1).toString().padStart(2, '0')).map(m => <option key={m}>{m}</option>)}</select>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Ano</label>
                          <select value={customYear} onChange={(e) => setCustomYear(e.target.value)} className="w-full p-4 bg-white rounded-2xl font-black text-xs outline-none border border-slate-100">{Array.from({length: 10}, (_, i) => (2020 + i).toString()).map(y => <option key={y}>{y}</option>)}</select>
                       </div>
                    </div>
                    <div className="bg-indigo-600 p-5 rounded-2xl shadow-lg shadow-indigo-600/20 text-white">
                       <label className="text-[7px] font-black uppercase opacity-60 mb-1 block tracking-widest">Preview do Primeiro Serial:</label>
                       <div className="font-mono font-black text-sm tracking-widest">{previewSerial}</div>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Produto</label>
                       <input list="product-list" placeholder="Ex: CA0066" value={newProduct} onChange={(e) => setNewProduct(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xs outline-none border-2 border-transparent focus:border-indigo-500 transition-all" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Voltagem</label>
                          <select value={newVoltage} onChange={(e) => setNewVoltage(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xs outline-none border-2 border-transparent focus:border-indigo-500 transition-all"><option>110V</option><option>220V</option></select>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Quantidade</label>
                          <input type="number" value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xs outline-none border-2 border-transparent focus:border-indigo-500 transition-all" />
                       </div>
                    </div>
                    <button onClick={generateAndSave} className="w-full py-6 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-xs shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                       <Plus size={20} /> Gerar e Sincronizar
                    </button>
                 </div>
              </div>
           </div>
        </div>

        {/* History Column */}
        <div className="lg:col-span-8 bg-white p-12 rounded-[56px] border border-slate-100 shadow-2xl min-h-[600px] flex flex-col">
           <div className="flex flex-col md:flex-row justify-between items-center mb-10 border-b pb-8 gap-6">
              <div>
                 <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Histórico de Produção</h3>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[4px]">Cloud Sync Ativo</p>
              </div>
              <div className="relative group">
                 <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-all" size={18} />
                 <input placeholder="Buscar por produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-14 pr-6 py-4 bg-slate-50 rounded-[20px] text-xs font-bold outline-none w-full md:w-64 border-2 border-transparent focus:border-indigo-100 transition-all shadow-inner" />
              </div>
           </div>

           <div className="space-y-4 flex-1 overflow-y-auto pr-4 custom-scrollbar">
              {isLoading && batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-slate-300 space-y-4">
                   <RefreshCw size={48} className="animate-spin opacity-20" />
                   <p className="font-black uppercase text-[10px] tracking-[4px]">Sincronizando Nuvem...</p>
                </div>
              ) : batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] bg-slate-50/50 rounded-[48px] border border-dashed border-slate-200 text-slate-300 space-y-4">
                   <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-inner"><Database size={32} /></div>
                   <div className="text-center">
                      <p className="font-black uppercase text-xs text-slate-400">Nenhum lote encontrado</p>
                      <p className="text-[10px] font-medium uppercase mt-1">Gere um novo lote ou verifique a conexão</p>
                   </div>
                </div>
              ) : (
                batches.filter(b => b.product_name?.toLowerCase().includes(searchTerm.toLowerCase())).map((batch) => (
                  <div key={batch.id} className={`p-8 rounded-[40px] border-2 transition-all group ${selectedIds.includes(batch.id) ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-600/30' : 'bg-slate-50 border-slate-50 hover:bg-white hover:border-indigo-100 shadow-sm'}`}>
                    <div className="flex items-center gap-8">
                       <div className="cursor-pointer" onClick={() => setSelectedIds(prev => prev.includes(batch.id) ? prev.filter(x => x !== batch.id) : [...prev, batch.id])}>
                          <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center transition-all ${selectedIds.includes(batch.id) ? 'bg-white/20' : 'bg-white border border-slate-200 text-slate-100 hover:text-indigo-400'}`}>
                             {selectedIds.includes(batch.id) ? <CheckSquare size={24} /> : <Square size={24} />}
                          </div>
                       </div>
                       <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                             <h4 className="font-black uppercase text-lg tracking-tighter">{batch.product_name}</h4>
                             <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${selectedIds.includes(batch.id) ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'}`}>{batch.voltage}</span>
                          </div>
                          <div className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-4 ${selectedIds.includes(batch.id) ? 'text-indigo-200' : 'text-slate-400'}`}>
                             <span className="flex items-center gap-1.5"><Hash size={12} /> {batch.start_serial} → {batch.end_serial}</span>
                             <span className="opacity-30">|</span>
                             <span className="flex items-center gap-1.5"><Calendar size={12} /> {new Date(batch.created_at || '').toLocaleDateString('pt-BR')}</span>
                             <span className="opacity-30">|</span>
                             <span className="flex items-center gap-1.5"><Plus size={12} /> {batch.quantity} UN</span>
                          </div>
                       </div>
                       <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => {setNewProduct(batch.product_name || ""); setNewVoltage(batch.voltage || "220V");}} title="Clonar Configuração" className={`p-4 rounded-2xl transition-all ${selectedIds.includes(batch.id) ? 'bg-white/10 hover:bg-white/20' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white'}`}><ArrowRight size={18} /></button>
                          <button onClick={() => deleteBatch(batch.id)} title="Excluir Lote" className={`p-4 rounded-2xl transition-all ${selectedIds.includes(batch.id) ? 'bg-white/10 hover:bg-rose-500' : 'bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white'}`}><Trash2 size={18} /></button>
                       </div>
                    </div>
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
});
