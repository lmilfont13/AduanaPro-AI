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
  ArrowRight,
  FileDown,
  ChevronDown,
  Pencil
} from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase, IS_SUPABASE_CONFIGURED } from '../lib/supabase';
import { toast } from 'sonner';
import { AlertTriangle, Cloud, CloudOff, CloudUpload } from 'lucide-react';

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
  is_synced?: boolean;
  product_image?: string;
}

export const SerialManager = React.memo(() => {
  const [batches, setBatches] = useState<SerialBatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualSerials, setManualSerials] = useState("");
  const [isManualMode, setIsManualMode] = useState(false);
  
  const [newProduct, setNewProduct] = useState("");
  const [newVoltage, setNewVoltage] = useState("220V");
  const [newQty, setNewQty] = useState(10);
  const [newImage, setNewImage] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SerialBatch>>({});
  
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
    created_at: item.created_at || new Date().toISOString(),
    is_synced: item.is_synced ?? false,
    product_image: item.product_image || null
  });

   const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Busca do Supabase
      const fetchFromTable = async (tableName: string) => {
        try {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false });
          if (error) return null;
          return data;
        } catch (e) { return null; }
      };

      const [dataFromBatches, dataFromHistory] = await Promise.all([
        fetchFromTable('serial_batches'),
        fetchFromTable('serial_history')
      ]);
      
      const supabaseData = [...(dataFromBatches || []), ...(dataFromHistory || [])];
      
      if (supabaseData.length === 0 && !IS_SUPABASE_CONFIGURED) {
        console.warn("Supabase não configurado ou tabelas vazias.");
      } else {
        console.log(`Dados carregados do Supabase: ${supabaseData.length} registros.`);
      }

      // 2. Busca do LocalStorage (Backup e Legados)
      const keysToTry = ['aduana_serials_backup', 'ADUANAPRO_SERIALS', 'serials_history', 'production_history', 'seriais_history'];
      let localData: any[] = [];
      
      for (const key of keysToTry) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`Dados encontrados na chave local: ${key}`, parsed.length);
              localData = [...localData, ...parsed];
            }
          } catch (e) {}
        }
      }
      
      // 3. Normalização e Merge
      const allRaw = [...(supabaseData || []), ...localData];
      const uniqueMap = new Map();

      console.log("Total de registros brutos:", allRaw.length);

      allRaw.forEach(item => {
        const normalized = normalizeBatch(item);
        const fromSupabase = supabaseData?.some(sbItem => sbItem.id === item.id);
        
        // Chave de unicidade: ID ou composição de dados
        const key = item.id || `${normalized.product_name}-${normalized.start_serial}-${normalized.created_at}`;
        
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, { ...normalized, id: key, is_synced: !!fromSupabase });
        } else if (fromSupabase) {
          uniqueMap.set(key, { ...uniqueMap.get(key), is_synced: true });
        }
      });

      const sorted = Array.from(uniqueMap.values()).sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      console.log("Resultado final da recomposição:", sorted.length, "lotes.");
      setBatches(sorted);
      if (sorted.length > 0) {
        localStorage.setItem('aduana_serials_backup', JSON.stringify(sorted.slice(0, 50)));
      }
    } catch (err: any) {
      console.error("Fetch error completo:", err);
      toast.error("Erro crítico ao carregar dados. Veja o console.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debugDatabase = async () => {
    setIsLoading(true);
    const results: any = { supabase: {}, local: {} };
    
    try {
      // Teste Supabase
      const { data, error, status, statusText } = await supabase.from('serial_batches').select('id').limit(100);
      results.supabase = { 
        configured: IS_SUPABASE_CONFIGURED,
        status, 
        statusText, 
        count: data?.length || 0,
        error: error?.message || "Nenhum"
      };
      
      // Teste Local
      const local = localStorage.getItem('aduana_serials_backup');
      results.local = {
        exists: !!local,
        size: local?.length || 0,
        count: local ? JSON.parse(local).length : 0
      };

      console.table(results);
      alert(`DIAGNÓSTICO:\n\nSUPABASE:\n- Configurado: ${results.supabase.configured}\n- Status: ${results.supabase.status}\n- Itens: ${results.supabase.count}\n- Erro: ${results.supabase.error}\n\nLOCAL:\n- Itens no backup: ${results.local.count}`);
      
      if (results.supabase.count === 0 && results.supabase.configured) {
        toast.info("O banco de dados parece estar conectado, mas a tabela 'serials' está vazia.");
      }
    } catch (e: any) {
      alert("Erro no diagnóstico: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const nextAvailableNum = useMemo(() => {
    const voltCode = newVoltage === "220V" ? "2" : "1";
    const month = customMonth;
    const year = customYear.slice(-2);
    const pattern = `${newProduct}-${voltCode}${month}${year}-`;
    
    // Procura o maior end_serial para este produto e padrão
    const samePatternBatches = batches.filter(b => 
      b.product_name === newProduct && 
      b.voltage === newVoltage && 
      b.pattern === pattern
    );

    if (samePatternBatches.length > 0) {
      // Ordena por end_serial descendente para garantir que pegamos o maior
      const sorted = [...samePatternBatches].sort((a, b) => (b.end_serial || 0) - (a.end_serial || 0));
      return (sorted[0].end_serial || 0) + 1;
    }
    return 1;
  }, [newProduct, newVoltage, customMonth, customYear, batches]);

  const previewSerial = useMemo(() => {
    const voltCode = newVoltage === "220V" ? "2" : "1";
    const month = customMonth;
    const year = customYear.slice(-2);
    const product = newProduct || "XXXX";
    return `${product}-${voltCode}${month}${year}-${nextAvailableNum.toString().padStart(4, '0')}`;
  }, [newProduct, newVoltage, customMonth, customYear, nextAvailableNum]);

  const generateAndSave = async () => {
    if (!newProduct) {
      toast.error("Informe o nome do produto.");
      return;
    }

    setIsLoading(true);
    try {
      const voltCode = newVoltage === "220V" ? "2" : "1";
      const month = customMonth;
      const year = customYear.slice(-2);
      const pattern = `${newProduct}-${voltCode}${month}${year}-`;
      
      const nextNum = nextAvailableNum;

      const startSerial = nextNum;
      const endSerial = nextNum + newQty - 1;
      
      let serialsList: string[] = [];
      if (isManualMode && manualSerials) {
        serialsList = manualSerials.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.length > 0);
      } else {
        serialsList = Array.from({ length: newQty }, (_, i) => `${pattern}${(startSerial + i).toString().padStart(4, '0')}`);
      }

      const newBatch: SerialBatch = {
        id: Math.random().toString(36).substr(2, 9),
        product_name: newProduct,
        voltage: newVoltage,
        quantity: newQty,
        start_serial: startSerial,
        end_serial: endSerial,
        serials_list: serialsList,
        pattern: pattern,
        created_at: new Date().toISOString(),
        product_image: newImage || undefined
      };

      // Salvar no Supabase
      const { error: sbError } = await supabase.from('serial_batches').insert([newBatch]);
      
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
      const { error } = await supabase.from('serial_batches').delete().eq('id', id);
      if (error) throw error;

      const updated = batches.filter(b => b.id !== id);
      setBatches(updated);
      localStorage.setItem('aduana_serials_backup', JSON.stringify(updated.slice(0, 50)));
      toast.success("Lote excluído.");
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const startEditing = (batch: SerialBatch) => {
    setEditingId(batch.id);
    setEditForm({ ...batch });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.product_name) {
      toast.error("Nome do produto é obrigatório.");
      return;
    }

    setIsLoading(true);
    try {
      const { is_synced, ...dataToUpdate } = editForm as SerialBatch;
      
      // Limpar campos para evitar erros no banco
      const payload = {
        product_name: dataToUpdate.product_name,
        voltage: dataToUpdate.voltage,
        product_image: dataToUpdate.product_image
      };

      const { error } = await supabase.from('serial_batches').update(payload).eq('id', editingId);
      
      if (error) throw error;

      setBatches(prev => prev.map(b => b.id === editingId ? { ...b, ...payload, is_synced: true } : b));
      localStorage.setItem('aduana_serials_backup', JSON.stringify(batches.slice(0, 50)));
      
      setEditingId(null);
      setEditForm({});
      toast.success("Lote atualizado com sucesso!");
    } catch (err: any) {
      console.error("Erro no salvamento:", err);
      toast.error("Erro ao salvar: " + (err.message || "Verifique o tamanho da imagem"));
    } finally {
      setIsLoading(false);
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

  const syncAllToCloud = async () => {
    if (!IS_SUPABASE_CONFIGURED) {
      toast.error("Supabase não configurado. Verifique suas variáveis de ambiente.");
      return;
    }

    const unsynced = batches.filter(b => !b.is_synced);
    if (unsynced.length === 0) {
      toast.info("Todos os lotes já estão sincronizados!");
      return;
    }

    setIsLoading(true);
    let successCount = 0;
    try {
      for (const batch of unsynced) {
        // Remove is_synced antes de mandar pro banco para evitar erro de coluna inexistente se não houver
        const { is_synced, ...dataToSave } = batch;
        const { error } = await supabase.from('serial_batches').insert([dataToSave]);
        if (!error) {
          successCount++;
          batch.is_synced = true;
        }
      }
      
      if (successCount > 0) {
        setBatches([...batches]);
        localStorage.setItem('aduana_serials_backup', JSON.stringify(batches.slice(0, 50)));
        toast.success(`${successCount} lotes sincronizados com a nuvem!`);
      } else {
        toast.error("Falha ao sincronizar lotes. Verifique a conexão.");
      }
    } catch (err: any) {
      toast.error("Erro no processo de sync: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const importSerialsData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.batches) {
          const importedBatches = data.batches.map((b: any) => ({ ...normalizeBatch(b), is_synced: false }));
          
          // Merge com os atuais evitando duplicatas
          const existingIds = new Set(batches.map(b => b.id));
          const newBatches = [...importedBatches.filter((b: any) => !existingIds.has(b.id)), ...batches];
          
          setBatches(newBatches);
          localStorage.setItem('aduana_serials_backup', JSON.stringify(newBatches.slice(0, 50)));
          toast.success("Backup de seriais importado! Clique em 'Nuvem' para sincronizar.");
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
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO DE PRODUÇÃO", 105, y, { align: 'center' });
    y += 10;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("MAMOMEIRO INTELLIGENCE - SISTEMA DE SERIAIS CLOUD", 105, y, { align: 'center' });
    y += 15;

    selectedBatches.forEach((batch) => {
      if (y > 230) { doc.addPage(); y = 20; }

      // Borda do Lote
      doc.setDrawColor(240);
      doc.setFillColor(252, 253, 255);
      doc.roundedRect(15, y - 5, 180, 45, 5, 5, 'FD');

      // Miniatura no PDF com detecção de formato
      if (batch.product_image && batch.product_image.startsWith('data:image')) {
        try {
          const format = batch.product_image.includes('png') ? 'PNG' : 'JPEG';
          doc.addImage(batch.product_image, format, 20, y, 35, 35, undefined, 'FAST');
        } catch (e) {
          console.warn("Erro imagem PDF", e);
          doc.setDrawColor(200); doc.rect(20, y, 35, 35);
          doc.setFontSize(6); doc.text("ERRO IMAGEM", 37.5, y + 17.5, { align: 'center' });
        }
      } else {
        doc.setDrawColor(200); doc.rect(20, y, 35, 35);
        doc.setFontSize(8); doc.text("SEM FOTO", 37.5, y + 17.5, { align: 'center' });
      }

      // Informações do Lote
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${batch.product_name} - ${batch.voltage}`, 60, y + 10);
      
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Quantidade: ${batch.quantity} unidades`, 60, y + 18);
      doc.text(`Sequência: ${batch.start_serial} até ${batch.end_serial}`, 60, y + 24);
      doc.text(`Data: ${new Date(batch.created_at || '').toLocaleDateString('pt-BR')}`, 60, y + 30);
      
      y += 55;

      const serials = batch.serials_list || [];
      doc.setFontSize(7);
      let xPos = 20;
      let serialY = y;
      
      serials.slice(0, 80).forEach((s) => {
        doc.text(s, xPos, serialY);
        xPos += 45;
        if (xPos > 170) { xPos = 20; serialY += 4; }
        if (serialY > 285) { doc.addPage(); serialY = 20; }
      });

      y = serialY + 15;
    });

    doc.save(`relatorio-producao-${new Date().getTime()}.pdf`);
    toast.success("PDF gerado com miniaturas!");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 p-4 lg:p-10 animate-in fade-in duration-500">
      {!IS_SUPABASE_CONFIGURED && (
        <div className="bg-orange-50 border-2 border-orange-200 p-6 rounded-[32px] flex items-center gap-6 animate-pulse">
           <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-orange-500/20">
              <AlertTriangle size={24} />
           </div>
           <div className="flex-1">
              <h4 className="font-black uppercase text-xs text-orange-900 tracking-tight">Aviso de Configuração: Cloud Desativada</h4>
              <p className="text-[10px] font-bold text-orange-700/80 uppercase tracking-widest mt-1">
                 As chaves do Supabase não foram detectadas. Seus seriais ficarão salvos **apenas neste computador**. 
                 Para habilitar a nuvem (Vercel), configure as variáveis de ambiente.
              </p>
           </div>
        </div>
      )}
      {/* ... (Header remains similar) */}
      <div className="bg-[#0F172A] p-10 rounded-[48px] text-white flex justify-between items-center shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-10 opacity-5"><Database size={160} /></div>
         <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 bg-indigo-500 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/20"><Hash size={32} /></div>
            <div>
               <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-3">Seriais <span className="text-indigo-400">Cloud</span> <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-md text-[8px] font-black uppercase">v2.1-FIXED</span></h2>
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
            <button 
              onClick={syncAllToCloud} 
              disabled={!IS_SUPABASE_CONFIGURED || isLoading}
              className={`flex items-center gap-2 px-6 py-4 rounded-[20px] font-black uppercase text-[10px] transition-all shadow-xl ${!IS_SUPABASE_CONFIGURED ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
            >
               <CloudUpload size={18} /> {isLoading ? 'Sincronizando...' : 'Sincronizar Nuvem'}
            </button>
            <button onClick={debugDatabase} title="Diagnóstico Técnico" className="p-5 bg-rose-500/10 text-rose-500 rounded-[20px] hover:bg-rose-500 hover:text-white transition-all">
               <Settings2 size={20} />
            </button>
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
                     <button 
                        onClick={() => setIsManualMode(!isManualMode)} 
                        className={`w-full py-3 rounded-xl text-[9px] font-black uppercase transition-all border-2 ${isManualMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'}`}
                     >
                        {isManualMode ? 'Voltar para Gerador Automático' : 'Usar Entrada Manual'}
                     </button>

                     {isManualMode ? (
                        <div className="space-y-1">
                           <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Lista de Seriais (um por linha)</label>
                           <textarea 
                              value={manualSerials} 
                              onChange={(e) => setManualSerials(e.target.value)}
                              placeholder="Cole seus seriais aqui..."
                              className="w-full h-32 p-4 bg-slate-50 rounded-2xl font-mono text-[10px] outline-none border-2 border-transparent focus:border-indigo-500 transition-all resize-none"
                           />
                        </div>
                     ) : (
                        <div className="space-y-4">
                           <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Foto do Produto</label>
                              <div className="relative group/img h-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all hover:border-indigo-300">
                                 {newImage ? (
                                    <>
                                       <img src={newImage} alt="Preview" className="w-full h-full object-cover" />
                                       <button onClick={() => setNewImage(null)} className="absolute top-2 right-2 p-2 bg-rose-500 text-white rounded-xl opacity-0 group-hover/img:opacity-100 transition-all shadow-lg"><Trash2 size={14} /></button>
                                    </>
                                 ) : (
                                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer gap-2">
                                       <Plus size={20} className="text-slate-300" />
                                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Upload Foto</span>
                                       <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                             const reader = new FileReader();
                                             reader.onload = (ev) => setNewImage(ev.target?.result as string);
                                             reader.readAsDataURL(file);
                                          }
                                       }} />
                                    </label>
                                 )}
                              </div>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Produto</label>
                              <input 
                                 list="existing-products" 
                                 placeholder="Ex: CA0066" 
                                 value={newProduct} 
                                 onChange={(e) => setNewProduct(e.target.value.toUpperCase())} 
                                 className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xs outline-none border-2 border-transparent focus:border-indigo-500 transition-all" 
                              />
                              <datalist id="existing-products">
                                 {Array.from(new Set(batches.map(b => b.product_name))).filter(Boolean).map(name => (
                                    <option key={name} value={name} />
                                 ))}
                              </datalist>
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
                        </div>
                     )}

                     <button onClick={generateAndSave} className="w-full py-6 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-xs shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                        <Plus size={20} /> {isManualMode ? 'Salvar Lista Manual' : 'Gerar e Sincronizar'}
                     </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* History Column */}
        <div className="lg:col-span-8 bg-white p-12 rounded-[56px] border border-slate-100 shadow-2xl min-h-[600px] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b pb-8 gap-6">
               <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Histórico de Produção</h3>
                  <div className="flex items-center gap-4 mt-2">
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[4px]">Cloud Sync Ativo</p>
                     <button 
                        onClick={() => setSelectedIds(selectedIds.length === batches.length ? [] : batches.map(b => b.id))}
                        className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-700 transition-all underline underline-offset-4"
                     >
                        {selectedIds.length === batches.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                     </button>
                  </div>
                 
                 {/* Filtros Rápidos */}
                 <div className="flex gap-2 mt-4">
                    {['FOGÃO', 'CHALEIRA', 'TODOS'].map(tag => (
                       <button 
                         key={tag}
                         onClick={() => setSearchTerm(tag === 'TODOS' ? '' : tag)}
                         className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${searchTerm === tag || (tag === 'TODOS' && searchTerm === '') ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                       >
                          {tag}
                       </button>
                    ))}
                 </div>
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
                        {batch.product_image ? (
                           <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md border border-white/20 shrink-0">
                              <img src={batch.product_image} alt={batch.product_name} className="w-full h-full object-cover" />
                           </div>
                        ) : (
                           <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 shrink-0">
                              <Hash size={24} />
                           </div>
                        )}
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
                              <span className="opacity-30">|</span>
                              <span className={`flex items-center gap-1.5 ${batch.is_synced ? 'text-emerald-500' : 'text-orange-500'}`}>
                                 {batch.is_synced ? <Cloud size={12} /> : <CloudOff size={12} />}
                                 {batch.is_synced ? 'SINCRONIZADO' : 'LOCAL'}
                              </span>
                           </div>
                        </div>
                        <div className="flex items-center gap-3 transition-all shrink-0">
                           <button onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)} title="Ver Detalhes" className={`p-4 rounded-2xl transition-all ${selectedIds.includes(batch.id) ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-100 text-slate-500 hover:bg-indigo-600 hover:text-white'}`}>
                               <Search size={18} />
                           </button>
                           <button onClick={() => startEditing(batch)} title="Editar Lote / Adicionar Foto" className={`p-4 rounded-2xl transition-all ${selectedIds.includes(batch.id) ? 'bg-white/10 hover:bg-white/20' : 'bg-amber-100 text-amber-600 hover:bg-amber-500 hover:text-white'}`}>
                               <Pencil size={18} />
                           </button>
                           <button onClick={() => {
                              setNewProduct(batch.product_name || ""); 
                              setNewVoltage(batch.voltage || "220V");
                              toast.info(`Configuração de ${batch.product_name} carregada. Próximo serial: ${nextAvailableNum}`);
                           }} title="Continuar Produção" className={`p-4 rounded-2xl transition-all ${selectedIds.includes(batch.id) ? 'bg-white/10 hover:bg-white/20' : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white'}`}><ArrowRight size={18} /></button>
                           <button onClick={() => deleteBatch(batch.id)} title="Excluir Lote" className={`p-4 rounded-2xl transition-all ${selectedIds.includes(batch.id) ? 'bg-white/10 hover:bg-rose-500' : 'bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white'}`}><Trash2 size={18} /></button>
                        </div>
                     </div>

                     {/* Edit Mode Content */}
                     {editingId === batch.id && (
                        <div className={`mt-8 pt-8 border-t bg-amber-50/50 p-8 rounded-[40px] animate-in slide-in-from-top-4 ${selectedIds.includes(batch.id) ? 'border-white/10' : 'border-slate-100'}`}>
                           <div className="flex flex-col md:flex-row items-center gap-8">
                              <div className="w-40 h-40 bg-white rounded-[32px] border-2 border-dashed border-amber-200 flex items-center justify-center overflow-hidden group/editimg relative shadow-inner shrink-0">
                                 {editForm.product_image ? (
                                    <>
                                       <img src={editForm.product_image} alt="Edit" className="w-full h-full object-cover" />
                                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/editimg:opacity-100 flex flex-col items-center justify-center transition-all text-white gap-2">
                                          <CloudUpload size={28} />
                                          <span className="text-[8px] font-black uppercase">Trocar Foto</span>
                                          <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                             const file = e.target.files?.[0];
                                             if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => setEditForm(prev => ({ ...prev, product_image: ev.target?.result as string }));
                                                reader.readAsDataURL(file);
                                             }
                                          }} />
                                       </div>
                                    </>
                                 ) : (
                                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer gap-2 hover:bg-amber-100/30 transition-all">
                                       <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-500"><Plus size={24} /></div>
                                       <span className="text-[10px] font-black text-amber-600 uppercase text-center px-4">Clique para Adicionar Foto</span>
                                       <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                             const reader = new FileReader();
                                             reader.onload = (ev) => setEditForm(prev => ({ ...prev, product_image: ev.target?.result as string }));
                                             reader.readAsDataURL(file);
                                          }
                                       }} />
                                    </label>
                                 )}
                              </div>
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                 <div className="space-y-1">
                                    <label className="text-[9px] font-black text-amber-600 uppercase tracking-widest ml-2">Nome do Produto</label>
                                    <input 
                                       value={editForm.product_name} 
                                       onChange={(e) => setEditForm(prev => ({ ...prev, product_name: e.target.value.toUpperCase() }))}
                                       className="w-full p-5 bg-white rounded-2xl font-black text-xs outline-none border border-amber-100 focus:border-amber-500 shadow-sm"
                                    />
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[9px] font-black text-amber-600 uppercase tracking-widest ml-2">Voltagem</label>
                                    <select 
                                       value={editForm.voltage} 
                                       onChange={(e) => setEditForm(prev => ({ ...prev, voltage: e.target.value }))}
                                       className="w-full p-5 bg-white rounded-2xl font-black text-xs outline-none border border-amber-100 focus:border-amber-500 shadow-sm"
                                    >
                                       <option>110V</option>
                                       <option>220V</option>
                                    </select>
                                 </div>
                                 <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-amber-100">
                                    <button onClick={() => setEditingId(null)} className="px-10 py-4 bg-white text-slate-400 rounded-2xl font-black uppercase text-[10px] border border-slate-100 hover:bg-slate-50">Cancelar</button>
                                    <button onClick={saveEdit} className="px-12 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 flex items-center gap-3">
                                       {isLoading ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Salvar Alterações
                                    </button>
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}

                     {/* Expanded Content: Serial List */}
                     {expandedId === batch.id && (
                        <div className={`mt-8 pt-8 border-t ${selectedIds.includes(batch.id) ? 'border-white/10' : 'border-slate-100'}`}>
                           <h5 className="text-[10px] font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                              <Hash size={14} /> Lista Completa de Seriais ({batch.serials_list?.length} unidades)
                           </h5>
                           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                              {batch.serials_list?.map((s, i) => (
                                 <div key={i} className={`p-3 rounded-xl font-mono text-[9px] text-center border transition-all ${selectedIds.includes(batch.id) ? 'bg-white/5 border-white/10 text-white/80' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'}`}>
                                    {s}
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
});
