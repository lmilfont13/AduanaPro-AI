import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Truck, FileDown, Trash2, Factory, Ship, Anchor, Image as ImageIcon, Copy } from 'lucide-react';
import { parseArrivalScheduleWithGroq } from '../services/groqService';
import { extractTextFromPDF } from '../services/pdfService';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface ScheduleItem {
  id: string;
  containers: string;
  description: string;
  cbm?: string;
  packages?: string;
  weight?: string;
  voltage?: string;
  model?: string;
  etaDate: string; // YYYY-MM-DD
  status: 'arrived' | 'transit' | 'factory';
  totalUnits?: string;
  unitsPerBox?: string;
}

export default function ArrivalSchedule() {
  const [items, setItems] = useState<ScheduleItem[]>(() => {
    const saved = localStorage.getItem('ADUANAPRO_ARRIVAL_SCHEDULE');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);
  const [customLogo, setCustomLogo] = useState<string>(() => localStorage.getItem('ADUANAPRO_LOGO') || "");
  const [showCatalog, setShowCatalog] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'analytics'>('timeline');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setCustomLogo(base64);
        localStorage.setItem('ADUANAPRO_LOGO', base64);
        toast.success("Logo atualizada com sucesso!");
      };
      reader.readAsDataURL(file);
    }
  };

  const getCatalogValue = (description: string, model: string): string => {
    try {
      const catalog = JSON.parse(localStorage.getItem('ADUANAPRO_UNITS_CATALOG') || '{}');
      const key = `${description.trim().toLowerCase()}_${(model || '').trim().toLowerCase()}`;
      return catalog[key] || "";
    } catch(e) { return ""; }
  };

  const countContainers = (ctnStr: string): number => {
    if (!ctnStr) return 0;
    let cleaned = ctnStr.replace(/^(CTN|CONTAINER|CONT|LOT|LOTE)[:\-\s]*/i, '').trim();
    if (cleaned.toUpperCase() === 'LOTE' || cleaned === '') return 0;
    
    const groups = cleaned.split(/[,&]|\s+E\s+/i).map(s => s.trim()).filter(Boolean);
    let total = 0;
    
    groups.forEach(group => {
      // Look for range like 51/55 or 51-55
      const rangeMatch = group.match(/(\d+)\s*[\/\-]\s*(\d+)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (end > start && end - start < 200) {
          total += (end - start + 1);
          return;
        }
      }
      
      // Otherwise count individual parts
      const parts = group.split(/[\/\-]/).map(s => s.trim()).filter(Boolean);
      total += parts.length > 0 ? parts.length : 1;
    });
    
    return total;
  };

  const getGroupKey = (ctn: string) => {
    if (!ctn) return "LOTE";
    // Aggressively clean prefixes and leading symbols
    let s = ctn.replace(/^(CTN|CONTAINER|CONT|LOT|LOTE)[\s\:\-\.]*/i, '').trim();
    s = s.replace(/^[\s\:\-\.]*/, '').trim(); // Remove any remaining leading symbols
    
    // Extract leading numbers/separators
    const match = s.match(/^[\d,/\-\s]+/);
    if (match && match[0].trim().length > 0) {
        return match[0].replace(/[\s\-\/\,]+$/, '').trim();
    }
    return s || "LOTE";
  };

  const saveToCatalog = (description: string, model: string, value: string) => {
    if (!description || !value) return;
    try {
      const catalog = JSON.parse(localStorage.getItem('ADUANAPRO_UNITS_CATALOG') || '{}');
      const key = `${description.trim().toLowerCase()}_${(model || '').trim().toLowerCase()}`;
      catalog[key] = value;
      localStorage.setItem('ADUANAPRO_UNITS_CATALOG', JSON.stringify(catalog));
    } catch(e) {}
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { 
        reader.onload = () => resolve((reader.result as string).split(',')[1]); 
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      const pdfText = file.type === "application/pdf" ? await extractTextFromPDF(base64) : "";
      
      const result = await parseArrivalScheduleWithGroq(base64, file.type, pdfText);
      if (result.items && Array.isArray(result.items)) {
        const newItems = result.items.map((i: any) => ({
          id: Math.random().toString(36).substring(2,9),
          containers: i.containers || "Lote",
          description: i.description || "Descrição",
          cbm: i.cbm || "0",
          packages: i.packages || "0",
          weight: i.weight || "0",
          voltage: i.voltage || "",
          model: i.model || "",
          etaDate: i.etaDate || "",
          status: i.status || 'transit',
          totalUnits: i.totalUnits || "",
          unitsPerBox: i.unitsPerBox || getCatalogValue(i.description || "", i.model || "")
        }));

        // Trigger calculation for those auto-filled
        const processedItems = newItems.map((item: any) => {
          if (item.unitsPerBox && item.totalUnits) {
            const total = parseFloat(item.totalUnits);
            const perBox = parseFloat(item.unitsPerBox);
            if (perBox > 0) item.packages = Math.ceil(total / perBox).toString();
          }
          return item;
        });

        setItems(prev => [...prev, ...processedItems]);
        toast.success("Cronograma logístico extraído com sucesso!");
      }
    } catch (e: any) {
      toast.error("Erro na extração: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const updateItem = (id: string, field: keyof ScheduleItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const newItem = { ...item, [field]: value };
        
        // Auto-retrieve from catalog if description or model changes
        if (field === 'description' || field === 'model') {
           const cached = getCatalogValue(newItem.description, newItem.model || "");
           if (cached && !newItem.unitsPerBox) newItem.unitsPerBox = cached;
        }

        if (field === 'totalUnits' || field === 'unitsPerBox') {
          const total = parseFloat(newItem.totalUnits || '0');
          const perBox = parseFloat(newItem.unitsPerBox || '0');
          if (perBox > 0) {
            newItem.packages = Math.ceil(total / perBox).toString();
          }
          // Save to catalog
          if (field === 'unitsPerBox' && value) {
            saveToCatalog(newItem.description, newItem.model || "", value);
          }
        }
        return newItem;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const duplicateItem = (id: string) => {
    const itemToCopy = items.find(i => i.id === id);
    if (itemToCopy) {
      const newItem = {
        ...itemToCopy,
        id: Math.random().toString(36).substring(2,9),
      };
      setItems(prev => [...prev, newItem]);
      toast.success("Lote duplicado!");
    }
  };

  const addItemFromCatalog = (productKey: string, unitsPerBox: string) => {
    const [desc, mod] = productKey.split('_');
    const newItem: ScheduleItem = {
      id: Math.random().toString(36).substring(2, 9),
      containers: "",
      description: desc.toUpperCase(),
      model: mod.toUpperCase(),
      unitsPerBox: unitsPerBox,
      etaDate: "",
      status: 'factory',
      packages: "0",
      totalUnits: "0",
      weight: "0",
      cbm: "0"
    };
    setItems(prev => [...prev, newItem]);
    setShowCatalog(false);
    toast.success("Produto do catálogo adicionado!");
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      id: Math.random().toString(36).substring(2,9),
      containers: "CTN NOVO",
      description: "Nova Mercadoria",
      cbm: "0",
      packages: "0",
      weight: "0",
      voltage: "",
      model: "",
      etaDate: new Date().toISOString().split('T')[0],
      status: 'factory',
      totalUnits: "",
      unitsPerBox: ""
    }]);
  };

  const saveItems = () => {
    localStorage.setItem('ADUANAPRO_ARRIVAL_SCHEDULE', JSON.stringify(items));
    toast.success("Containers salvos no navegador!");
  };

  const clearScreen = () => {
    if(confirm("Apagar todos os registros da tela? (Isso não apagará os lotes que já foram salvos no botão verde)")) {
      setItems([]);
      toast.success("Tela limpa.");
    }
  };

  const loadSavedItems = () => {
    try {
      const saved = localStorage.getItem('ADUANAPRO_ARRIVAL_SCHEDULE');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
          toast.success(`${parsed.length} lotes carregados com sucesso!`);
          return;
        }
      }
      toast.error("Nenhum lote salvo encontrado no cache do navegador.");
    } catch (e) {
      toast.error("Erro ao ler os dados salvos.");
    }
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      const renderPDFHeader = (title: string = "ARRIVAL SCHEDULE") => {
        if (customLogo) {
          try { doc.addImage(customLogo, 'PNG', 15, 10, 20, 20); } catch(e){}
        } else {
          doc.setFillColor(15, 23, 42);
          doc.roundedRect(15, 10, 18, 18, 4, 4, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.text("AP", 24, 23, { align: 'center' });
        }
        
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text(title, 40, 23);
        
        const generationDate = new Date().toLocaleString('pt-BR');
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(`Gerado em: ${generationDate}`, pageWidth - 15, 15, { align: 'right' });
      };

      renderPDFHeader();
    
    // 1. GANTT PAGE
    const renderTimelineLegend = () => {
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("LOGISTICS TIMELINE", 20, 45);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("Visualization based on current arrival forecasts (ETA). * TBA = To Be Announced (A Definir).", 20, 50);
      
      // Discrete Legend
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      
      doc.setFillColor(249, 115, 22);
      doc.rect(20, 56, 2.5, 2.5, 'F');
      doc.setTextColor(100, 116, 139);
      doc.text("FACTORY", 24, 58.5);
      
      doc.setFillColor(59, 130, 246);
      doc.rect(40, 56, 2.5, 2.5, 'F');
      doc.text("TRANSIT", 44, 58.5);
      
      doc.setFillColor(16, 185, 129);
      doc.rect(60, 56, 2.5, 2.5, 'F');
      doc.text("ARRIVED", 64, 58.5);
      
      // Timeline Axis
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(1.5);
      doc.line(120, 65, pageWidth - 20, 65);
      
      // Dates top axis
      doc.setFontSize(6);
      doc.setTextColor(156, 163, 175);
      const msPerDay = 1000 * 60 * 60 * 24;
      for (let i = -2; i <= 6; i++) {
         const x = 160 + (i * 20); 
         const daysOffset = i * 18;
         const d = new Date();
         d.setTime(d.getTime() + daysOffset * msPerDay);
         const month = d.toLocaleString('en-US', { month: 'short' });
         const day = d.getDate().toString().padStart(2, '0');
         doc.text(`${month} ${day}`, x - 3, 62);
      }
      
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(234, 88, 12);
      doc.text("TODAY", 160, 58, { align: 'center' });
    };

    renderTimelineLegend();
      
      // Render Items
      let y = 75;
      const todayDate = new Date();
      todayDate.setHours(0,0,0,0);
      
      // Aglutinate by lot group for Timeline
      const timelineAggregated = items.reduce((acc: any[], item) => {
        const gKey = getGroupKey(item.containers);
        const existing = acc.find(i => getGroupKey(i.containers) === gKey);
        if (existing) {
          if (!existing.products.includes(item.description)) {
            existing.products.push(item.description);
          }
        } else {
          acc.push({ 
            ...item, 
            gKey, 
            products: [item.description] 
          });
        }
        return acc;
      }, []);

      let pageStartY = 60;
      timelineAggregated.forEach((item, index) => {
        let itemDate = item.etaDate ? new Date(item.etaDate) : new Date();
        if (!item.etaDate) itemDate.setDate(itemDate.getDate() + 45); 
        itemDate.setHours(0,0,0,0);
        
        const ctnCount = countContainers(item.gKey);
        const label = `CTN: ${item.gKey} (${ctnCount})`;
        const splitLabel = doc.splitTextToSize(label, 95);
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(splitLabel, 18, y);
        
        // Product list under container name (discrete)
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        const prodText = item.products.join(', ');
        const splitProd = doc.splitTextToSize(prodText, 95);
        doc.text(splitProd, 18, y + 4);
        
        doc.setFillColor(248, 250, 252);
        doc.rect(120, y - 3, pageWidth - 140, 5, 'F');
        
        let barColor = [249, 115, 22]; 
        let textColor = [194, 65, 12];
        let w = 80;
        let startX = 120;
        
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysDiff = (itemDate.getTime() - todayDate.getTime()) / msPerDay;
        const futureRatio = Math.max(0, Math.min(daysDiff, 90)) / 90;
        
        if (item.status === 'arrived') { 
          barColor = [16, 185, 129]; 
          textColor = [4, 120, 87];
          w = 20; 
          startX = 140; 
        } else if (item.status === 'transit') { 
          barColor = [59, 130, 246]; 
          textColor = [37, 99, 235];
          w = 40 + (futureRatio * 100);
          startX = 120; 
        } else if (item.status === 'factory') {
          barColor = [249, 115, 22]; 
          textColor = [194, 65, 12];
          startX = 160;
          w = Math.max(10, futureRatio * 100);
        }
        
        doc.setFillColor(barColor[0], barColor[1], barColor[2]);
        doc.rect(startX, y - 3, w, 5, 'F');
        
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        
        if (item.status === 'transit') {
          doc.text(item.etaDate ? item.etaDate.split('-').reverse().join('/') : 'TBA', startX + w + 1.5, y + 0.5);
        } else if (item.status === 'factory') {
          doc.text("FACTORY", startX + w + 1.5, y + 0.5);
        } else {
          doc.text(item.etaDate ? item.etaDate.split('-').reverse().join('/') : 'TBA', startX + w + 1.5, y + 0.5);
        }
        
        y += 12;

        if (y > 185 || index === timelineAggregated.length - 1) { 
          // Draw the TODAY line for the current page items
          doc.setDrawColor(253, 186, 116);
          doc.setLineWidth(0.5);
          doc.setLineDashPattern([2, 2], 0);
          doc.line(160, pageStartY, 160, y - 4);
          doc.setLineDashPattern([], 0);

          if (y > 185 && index < timelineAggregated.length - 1) {
            doc.addPage(); 
            renderPDFHeader();
            renderTimelineLegend();
            y = 80; 
            pageStartY = 70;
          }
        }
      });
      
      // 2. EXECUTIVE SUMMARY PAGE (NEW)
      doc.addPage();
      renderPDFHeader("EXECUTIVE LOGISTICS SUMMARY");

      // Correct Stats Calculation based on Container Groups and Ranges
      const uniqueGroups = Array.from(new Set(items.map(i => getGroupKey(i.containers))));
      
      let totalUnique = 0;
      let transCount = 0;
      let prodCount = 0;
      
      uniqueGroups.forEach(g => {
          const groupItems = items.filter(i => getGroupKey(i.containers) === g);
          const cCount = countContainers(g); 
          totalUnique += cCount;
          
          const hasTransit = groupItems.some(i => i.status === 'transit');
          const hasFactory = groupItems.some(i => i.status === 'factory');
          
          if (hasTransit) transCount += cCount;
          else if (hasFactory) prodCount += cCount;
      });

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(20, 40, 60, 25, 3, 3, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("TOTAL CONTAINERS", 30, 50);
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(totalUnique.toString(), 30, 58);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(90, 40, 60, 25, 3, 3, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("EM PRODUÇÃO", 100, 50);
      doc.setFontSize(14);
      doc.setTextColor(249, 115, 22);
      doc.text(prodCount.toString(), 100, 58);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(160, 40, 60, 25, 3, 3, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("EM TRÂNSITO", 170, 50);
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text(transCount.toString(), 170, 58);

      // Product Summary Table
      // Product Summary Table - EXECUTIVE DASHBOARD STYLE
      let ctnY = 75;
      doc.setFillColor(15, 23, 42);
      doc.rect(20, ctnY, pageWidth - 40, 10, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("GLOBAL INVENTORY & DISTRIBUTION INTELLIGENCE", pageWidth / 2, ctnY + 6.5, { align: 'center' });
      ctnY += 12;
      
      doc.setFillColor(241, 245, 249);
      doc.rect(20, ctnY, pageWidth - 40, 7, 'F');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text("PRODUCT / MODEL", 25, ctnY + 4.5);
      doc.text("IN TRANSIT (U / CX)", 140, ctnY + 4.5);
      doc.text("IN FACTORY (U / CX)", 185, ctnY + 4.5);
      doc.text("TOTAL (U / CX)", 230, ctnY + 4.5);
      doc.text("VOLUME (CBM)", 265, ctnY + 4.5);
      ctnY += 10;

      const prodSummary = items.reduce((acc: any[], item) => {
        const desc = (item.description || "").trim().toUpperCase();
        const mod = (item.model || "").trim().toUpperCase();
        const key = `${desc}_${mod}`;
        const ctn = (item.containers || "").trim().toUpperCase();
        const pkgs = parseFloat(item.packages || '0');
        const units = parseFloat(item.totalUnits || '0');
        const cbm = parseFloat(item.cbm || '0');
        
        const existing = acc.find(i => i.key === key);
        if (existing) {
          existing.pkgs += pkgs;
          existing.units += units;
          existing.cbm += cbm;
          if (item.status === 'transit') {
            existing.transitPkgs += pkgs;
            existing.transitUnits += units;
          }
          if (item.status === 'factory') {
            existing.factoryPkgs += pkgs;
            existing.factoryUnits += units;
          }
        } else {
          acc.push({ 
            key, desc, mod, pkgs, units, cbm,
            transitPkgs: item.status === 'transit' ? pkgs : 0,
            transitUnits: item.status === 'transit' ? units : 0,
            factoryPkgs: item.status === 'factory' ? pkgs : 0,
            factoryUnits: item.status === 'factory' ? units : 0
          });
        }
        return acc;
      }, []);

      // Sort by description so types are together
      prodSummary.sort((a, b) => a.desc.localeCompare(b.desc));

      prodSummary.forEach((p, idx) => {
        if (ctnY > 190) {
          doc.addPage();
          renderPDFHeader("GLOBAL INVENTORY INTELLIGENCE");
          ctnY = 50;
          doc.setFillColor(241, 245, 249);
          doc.rect(20, ctnY, pageWidth - 40, 7, 'F');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text("PRODUCT / MODEL", 25, ctnY + 4.5);
          doc.text("IN TRANSIT (U / CX)", 140, ctnY + 4.5);
          doc.text("IN FACTORY (U / CX)", 185, ctnY + 4.5);
          doc.text("TOTAL (U / CX)", 230, ctnY + 4.5);
          doc.text("VOLUME (CBM)", 265, ctnY + 4.5);
          ctnY += 10;
        }
        
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(20, ctnY - 4, pageWidth - 40, 7, 'F');
        }
        
        doc.setFontSize(6.5);
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "normal");
        
        const label = p.mod ? `${p.desc} (MOD: ${p.mod})` : `${p.desc}`;
        const splitLabel = doc.splitTextToSize(label, 120);
        doc.text(splitLabel, 25, ctnY);
        
        const transitText = `${p.transitUnits} / ${p.transitPkgs}`;
        const factoryText = `${p.factoryUnits} / ${p.factoryPkgs}`;
        const totalText = `${p.units} / ${p.pkgs}`;
        
        doc.text(transitText, 140, ctnY);
        doc.text(factoryText, 185, ctnY);
        
        doc.setFont("helvetica", "bold");
        doc.text(totalText, 230, ctnY);
        doc.text(p.cbm.toFixed(2), 265, ctnY);
        
        ctnY += 6.5; // Compressed height
      });

      // 3. LOGISTICS ANALYTICS PAGE (NEW)
      doc.addPage();
      renderPDFHeader("LOGISTICS ANALYTICS & DISTRIBUTION");
      
      const totalUnitsAll = prodSummary.reduce((acc: number, p: any) => acc + p.units, 0);
      
      // Sort for analytics: Highest percentage first
      const analyticsSorted = [...prodSummary].sort((a, b) => b.units - a.units);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text("UNIT DISTRIBUTION BY PRODUCT (%)", 20, 45);
      
      // Color Legend for the charts
      doc.setFontSize(7);
      doc.setFillColor(59, 130, 246);
      doc.rect(20, 52, 3, 3, 'F');
      doc.setTextColor(71, 85, 105);
      doc.text("IN TRANSIT", 25, 54.5);
      
      doc.setFillColor(249, 115, 22);
      doc.rect(45, 52, 3, 3, 'F');
      doc.text("IN FACTORY", 50, 54.5);
      
      let chartY = 65;
      analyticsSorted.forEach((p, idx) => {
        if (chartY > 185) {
            doc.addPage();
            renderPDFHeader("LOGISTICS ANALYTICS (CONT.)");
            chartY = 50;
        }

        const label = p.mod ? `${p.desc} (${p.mod})` : p.desc;
        const shortLabel = label.length > 50 ? label.substring(0, 50) + "..." : label;
        
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text(shortLabel, 20, chartY);
        
        const totalW = 180;
        const transitPct = totalUnitsAll > 0 ? (p.transitUnits / totalUnitsAll) * 100 : 0;
        const factoryPct = totalUnitsAll > 0 ? (p.factoryUnits / totalUnitsAll) * 100 : 0;
        const itemPct = totalUnitsAll > 0 ? (p.units / totalUnitsAll) * 100 : 0;
        
        // Bar Background
        doc.setFillColor(241, 245, 249);
        doc.rect(80, chartY - 3, totalW, 4, 'F');
        
        // Bar Transit (Blue)
        const transitW = (p.transitUnits / p.units) * totalW * (itemPct / 100);
        if (p.transitUnits > 0) {
            doc.setFillColor(59, 130, 246);
            doc.rect(80, chartY - 3, transitW, 4, 'F');
        }
        
        // Bar Factory (Orange)
        const factoryW = (p.factoryUnits / p.units) * totalW * (itemPct / 100);
        if (p.factoryUnits > 0) {
            doc.setFillColor(249, 115, 22);
            doc.rect(80 + transitW, chartY - 3, factoryW, 4, 'F');
        }
        
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(`${itemPct.toFixed(1)}% OF TOTAL`, 80 + totalW + 5, chartY);
        
        // Legend under bar
        doc.setFontSize(5);
        doc.text(`T: ${p.transitUnits} U | F: ${p.factoryUnits} U | TOTAL: ${p.units} U`, 80, chartY + 3);
        
        chartY += 12;
      });

      // 4. DETAILED REPORT PAGE
      doc.addPage();
      renderPDFHeader("DETAILED LOGISTICS MANIFEST");
      
      y = 45;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("Comprehensive logistics breakdown per container/lot.", 20, 50);
      
      // Calculate Totals
      const totalPkgs = items.reduce((acc, item) => acc + (parseFloat(item.packages) || 0), 0);
      const totalGwk = items.reduce((acc, item) => acc + (parseFloat(item.weight) || 0), 0);
      const totalCbm = items.reduce((acc, item) => acc + (parseFloat(item.cbm) || 0), 0);
      
      // Summary Card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      const cardWidth = 85;
      const cardX = pageWidth - cardWidth - 15;
      doc.roundedRect(cardX, 38, cardWidth, 15, 2, 2, 'FD');
      
      const col1 = cardX + (cardWidth / 6) * 1;
      const col2 = cardX + (cardWidth / 6) * 3;
      const col3 = cardX + (cardWidth / 6) * 5;

      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("TOTAL PKGS", col1, 44, { align: 'center' });
      doc.text("TOTAL GWK", col2, 44, { align: 'center' });
      doc.text("TOTAL CBM", col3, 44, { align: 'center' });
      
      const formatTotal = (num: number) => Number.isInteger(num) ? num.toString() : num.toFixed(2);
      
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(formatTotal(totalPkgs), col1, 50, { align: 'center' });
      doc.text(formatTotal(totalGwk), col2, 50, { align: 'center' });
      doc.text(formatTotal(totalCbm), col3, 50, { align: 'center' });

      // Table Header
      y = 65;
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, pageWidth - 30, 10, 'F');
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text("DESCRIPTION", 20, y + 6.5);
      doc.text("UNITS", 135, y + 6.5);
      doc.text("U/CTN", 160, y + 6.5);
      doc.text("PKGS", 185, y + 6.5);
      doc.text("GWK", 210, y + 6.5);
      doc.text("CBM", 235, y + 6.5);
      doc.text("ETA", 255, y + 6.5);
      doc.text("STATUS", 275, y + 6.5);
      
      y += 8;
      
      // Detailed Manifest - Consolidated and Normalized
      const normalizedItems = items.map(i => ({
          ...i,
          containers: (i.containers || "Lote").trim().toUpperCase(),
          description: (i.description || "Sem Descrição").trim(),
          model: (i.model || "").trim(),
          voltage: (i.voltage || "").trim()
      }));

      const aggregated = normalizedItems.reduce((acc: ScheduleItem[], item) => {
          const gKey = getGroupKey(item.containers);
          const existing = acc.find(i => 
              getGroupKey(i.containers) === gKey && 
              i.description.toLowerCase() === item.description.toLowerCase() &&
              (i.model || "").toLowerCase() === (item.model || "").toLowerCase() &&
              (i.voltage || "").toLowerCase() === (item.voltage || "").toLowerCase()
          );
          if (existing) {
              existing.packages = (parseFloat(existing.packages || '0') + parseFloat(item.packages || '0')).toString();
              existing.weight = (parseFloat(existing.weight || '0') + parseFloat(item.weight || '0')).toFixed(2);
              existing.cbm = (parseFloat(existing.cbm || '0') + parseFloat(item.cbm || '0')).toFixed(2);
              // Use earliest ETA
              if (item.etaDate && (!existing.etaDate || item.etaDate < existing.etaDate)) {
                  existing.etaDate = item.etaDate;
              }
          } else {
              acc.push({ ...item });
          }
          return acc;
      }, []);

      // Determine priority and earliest ETA per group to keep them grouped while prioritizing ETA
      const groupData: Record<string, { prio: number, earliestEta: string }> = {};
      aggregated.forEach(item => {
          const g = getGroupKey(item.containers);
          const current = groupData[g] || { prio: 99, earliestEta: "9999-12-31" };
          
          let prio = 99;
          if (item.status === 'transit') prio = 1;
          else if (item.status === 'factory') prio = 2;
          else if (item.status === 'arrived') prio = 3;
          
          const itemEta = item.etaDate || "9999-12-31";
          
          groupData[g] = {
              prio: Math.min(current.prio, prio),
              earliestEta: itemEta < current.earliestEta ? itemEta : current.earliestEta
          };
      });

      const sortedItems = aggregated.sort((a, b) => {
          const groupA = getGroupKey(a.containers);
          const groupB = getGroupKey(b.containers);
          const dataA = groupData[groupA];
          const dataB = groupData[groupB];
          
          // Primary: Order by earliest ETA in the group
          if (dataA.earliestEta !== dataB.earliestEta) {
              return dataA.earliestEta.localeCompare(dataB.earliestEta);
          }
          
          // Secondary: If ETA is same, sort by group name
          if (groupA !== groupB) return groupA.localeCompare(groupB, undefined, { numeric: true });
          
          // Within group, sort by status
          const sPrio: Record<string, number> = { 'transit': 1, 'factory': 2, 'arrived': 3 };
          return (sPrio[a.status as keyof typeof sPrio] || 99) - (sPrio[b.status as keyof typeof sPrio] || 99);
      });
      
      let currentGroup = "";
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      sortedItems.forEach((item, index) => {
        const itemGroup = getGroupKey(item.containers);
        if (currentGroup !== itemGroup) {
            currentGroup = itemGroup;
            
            if (y > 175) {
              doc.addPage();
              y = 30;
              doc.setFillColor(241, 245, 249);
              doc.rect(15, y, pageWidth - 30, 10, 'F');
              doc.setFontSize(8);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(100, 116, 139);
              doc.text("DESCRIPTION", 20, y + 6.5);
              doc.text("UNITS", 135, y + 6.5);
              doc.text("U/CTN", 160, y + 6.5);
              doc.text("PKGS", 185, y + 6.5);
              doc.text("GWK", 210, y + 6.5);
              doc.text("CBM", 235, y + 6.5);
              doc.text("ETA", 255, y + 6.5);
              doc.text("STATUS", 275, y + 6.5);
              y += 10;
            }
            
            doc.setFillColor(248, 250, 252);
            doc.rect(15, y, pageWidth - 30, 8, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.5);
            doc.line(15, y, pageWidth - 15, y);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42); // Force dark color for visibility
            
            const ctnCount = countContainers(currentGroup);
            const headerLabel = `CTN: ${currentGroup} (${ctnCount})`;
            doc.text(headerLabel.toUpperCase(), 20, y + 5.5);
            y += 8;
        }
        
        doc.setFontSize(7);
        if (index % 2 === 0) {
          doc.setFillColor(252, 253, 254);
          doc.rect(15, y, pageWidth - 30, 8, 'F');
        }
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const descText = item.description || "Sem Descrição";
        const modelText = item.model ? ` - MOD: ${item.model}` : "";
        const fullDesc = item.voltage ? `${descText}${modelText} [${item.voltage}]` : `${descText}${modelText}`;
        const shortDesc = fullDesc.length > 60 ? fullDesc.substring(0, 60) + "..." : fullDesc;
        doc.text(shortDesc, 20, y + 5.5);
        doc.text(String(item.totalUnits || '0'), 135, y + 5.5);
        doc.text(String(item.unitsPerBox || '0'), 160, y + 5.5);
        doc.text(String(item.packages || '0'), 185, y + 5.5);
        doc.text(String(item.weight || '0'), 210, y + 5.5);
        doc.text(String(item.cbm || '0'), 235, y + 5.5);
        
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(item.etaDate ? item.etaDate.split('-').reverse().join('/') : 'TBA', 255, y + 5.5);
        
        // Status Pill
        const status = item.status || 'factory';
        let pillColor = [249, 115, 22];
        if (status === 'arrived') pillColor = [16, 185, 129];
        if (status === 'transit') pillColor = [59, 130, 246];
        
        doc.setFillColor(pillColor[0], pillColor[1], pillColor[2]);
        doc.roundedRect(274, y + 1.5, 15, 5, 1, 1, 'F');
        doc.setFontSize(5);
        doc.setTextColor(255, 255, 255);
        doc.text(status.toUpperCase(), 281.5, y + 5, { align: 'center' });
        
        y += 8;
        
        if (y > 185 && index < sortedItems.length - 1) {
          doc.addPage();
          renderPDFHeader("DETAILED LOGISTICS MANIFEST");
          y = 50;
          doc.setFillColor(241, 245, 249);
          doc.rect(15, y, pageWidth - 30, 10, 'F');
          
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(100, 116, 139);
          doc.text("DESCRIPTION", 20, y + 6.5);
          doc.text("UNITS", 135, y + 6.5);
          doc.text("U/CTN", 160, y + 6.5);
          doc.text("PKGS", 185, y + 6.5);
          doc.text("GWK", 210, y + 6.5);
          doc.text("CBM", 235, y + 6.5);
          doc.text("ETA", 255, y + 6.5);
          doc.text("STATUS", 275, y + 6.5);
          y += 10;
        }
      });
      
      // Footer Line
      doc.setDrawColor(226, 232, 240);
      doc.line(15, y, pageWidth - 15, y);
      
      
      doc.save("Arrival_Schedule_Report.pdf");
    } catch (error: any) {
      alert("Erro ao gerar PDF: " + (error.message || error));
      console.error(error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
             <Truck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Logistics Timeline</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Controle de Expedição (Arrival Schedule)</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadSavedItems} className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-2xl text-[10px] font-black uppercase hover:bg-blue-100 transition-all">
            Carregar Salvos
          </button>
          <button onClick={clearScreen} className="flex items-center gap-2 px-6 py-3 bg-white text-slate-400 border border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all">
            Limpar Tela
          </button>
          <button onClick={saveItems} className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
            Salvar Lotes
          </button>
          
          <input 
            type="file" 
            ref={logoInputRef}
            onChange={handleLogoUpload}
            accept="image/png, image/jpeg"
            className="hidden" 
          />
          <button onClick={() => logoInputRef.current?.click()} className="flex items-center gap-2 px-4 py-3 bg-white text-slate-400 border border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">
            <ImageIcon size={16} /> Logo
          </button>
          
          <button onClick={generatePDF} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all shadow-xl">
            <FileDown size={16} /> Gerar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div {...getRootProps()} className="p-10 border-2 border-dashed border-slate-200 rounded-[32px] bg-white hover:border-orange-500 hover:bg-orange-50/10 transition-all text-center cursor-pointer">
            <input {...getInputProps()} />
            <Upload size={32} className="mx-auto text-slate-300 mb-4" />
            <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Arraste o PL para extrair envios</p>
            {loading && <p className="text-orange-500 text-xs font-bold mt-4 animate-pulse">Analisando lotes via IA...</p>}
          </div>



          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4 overflow-hidden">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-4 flex justify-between items-center">
              Ajustes Manuais
              <span className="text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">{items.length} LOTES</span>
            </h3>
            {items.map(item => (
              <div key={item.id} className="p-4 bg-slate-50 rounded-2xl space-y-3 relative group">
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => duplicateItem(item.id)} className="text-slate-300 hover:text-blue-500 p-1" title="Duplicar">
                    <Copy size={14}/>
                  </button>
                  <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-rose-500 p-1" title="Excluir">
                    <Trash2 size={14}/>
                  </button>
                </div>
                <input 
                  value={item.containers} 
                  onChange={e => updateItem(item.id, 'containers', e.target.value)}
                  className="w-full bg-transparent text-xs font-black text-slate-800 outline-none uppercase placeholder:text-slate-300"
                  placeholder="CTN / LOTE"
                />
                
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <input 
                    value={item.description} 
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    className="w-full bg-transparent text-[10px] font-black text-slate-600 outline-none placeholder:text-slate-300 uppercase"
                    placeholder="DESCRIÇÃO"
                  />
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-300 uppercase">Modelo / Volts</label>
                      <div className="flex gap-1 border-b border-slate-100 pb-1">
                        <input 
                          value={item.model || ''} 
                          onChange={e => updateItem(item.id, 'model', e.target.value)}
                          className="w-1/2 bg-transparent text-[9px] font-bold text-slate-500 outline-none"
                          placeholder="MOD"
                        />
                        <input 
                          value={item.voltage || ''} 
                          onChange={e => updateItem(item.id, 'voltage', e.target.value)}
                          className="w-1/2 bg-transparent text-[9px] font-bold text-slate-500 outline-none border-l border-slate-100 pl-1"
                          placeholder="VOLTS"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-300 uppercase">CBM / GWK</label>
                      <div className="flex gap-1 border-b border-slate-100 pb-1">
                        <input 
                          value={item.cbm || ''} 
                          onChange={e => updateItem(item.id, 'cbm', e.target.value)}
                          className="w-1/2 bg-transparent text-[9px] font-bold text-slate-500 outline-none"
                          placeholder="CBM"
                        />
                        <input 
                          value={item.weight || ''} 
                          onChange={e => updateItem(item.id, 'weight', e.target.value)}
                          className="w-1/2 bg-transparent text-[9px] font-bold text-slate-500 outline-none border-l border-slate-100 pl-1"
                          placeholder="GWK"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-orange-300 uppercase">Unidades / CX</label>
                      <div className="flex gap-1 border-b border-orange-100 pb-1">
                        <input 
                          value={item.totalUnits || ''} 
                          onChange={e => updateItem(item.id, 'totalUnits', e.target.value)}
                          className="w-1/2 bg-transparent text-[9px] font-black text-orange-600 outline-none"
                          placeholder="TOTAL"
                        />
                        <input 
                          value={item.unitsPerBox || ''} 
                          onChange={e => updateItem(item.id, 'unitsPerBox', e.target.value)}
                          className="w-1/2 bg-transparent text-[9px] font-bold text-orange-500 outline-none border-l border-orange-100 pl-1"
                          placeholder="U/CX"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-300 uppercase">Pacotes (PKGS)</label>
                      <div className="flex gap-1 border-b border-slate-100 pb-1">
                        <input 
                          value={item.packages || ''} 
                          onChange={e => updateItem(item.id, 'packages', e.target.value)}
                          className="w-full bg-transparent text-[9px] font-black text-slate-800 outline-none"
                          placeholder="PKGS"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <input 
                      type="date"
                      value={item.etaDate || ''} 
                      onChange={e => updateItem(item.id, 'etaDate', e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg p-1.5 text-[9px] font-bold outline-none"
                    />
                    <select 
                      value={item.status}
                      onChange={e => updateItem(item.id, 'status', e.target.value as any)}
                      className="bg-white border border-slate-200 rounded-lg p-1.5 text-[9px] font-black uppercase outline-none"
                    >
                      <option value="factory">FACTORY</option>
                      <option value="transit">TRANSIT</option>
                      <option value="arrived">ARRIVED</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={addItem} className="flex-[2] py-4 border-2 border-dashed border-slate-200 text-slate-400 font-black uppercase text-[10px] rounded-2xl hover:bg-slate-50 transition-all">
                + Adicionar Lote Manual
              </button>
              <button 
                onClick={() => setShowCatalog(true)} 
                className="flex-1 py-4 bg-slate-900 text-white font-black uppercase text-[10px] rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
              >
                Catálogo
              </button>
            </div>

            {showCatalog && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Seu Catálogo de Produtos</h3>
                    <button onClick={() => setShowCatalog(false)} className="text-slate-400 hover:text-slate-600">
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto space-y-2">
                    {Object.entries(JSON.parse(localStorage.getItem('ADUANAPRO_UNITS_CATALOG') || '{}')).length === 0 ? (
                      <p className="text-center py-10 text-slate-400 text-xs font-bold uppercase">Nenhum produto cadastrado ainda.</p>
                    ) : (
                      Object.entries(JSON.parse(localStorage.getItem('ADUANAPRO_UNITS_CATALOG') || '{}')).map(([key, value]) => {
                        const [desc, mod] = key.split('_');
                        return (
                          <button 
                            key={key}
                            onClick={() => addItemFromCatalog(key, value as string)}
                            className="w-full p-4 bg-slate-50 rounded-2xl text-left hover:bg-orange-50 hover:ring-2 hover:ring-orange-200 transition-all group"
                          >
                            <div className="text-[10px] font-black text-slate-800 uppercase">{desc}</div>
                            <div className="flex justify-between items-end mt-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Modelo: {mod || 'N/A'}</span>
                              <span className="text-[9px] font-black text-orange-500 uppercase">{value as string} UNID/CTN</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100">
                    <p className="text-[8px] text-slate-400 font-bold uppercase text-center">Clique em um produto para carregar na lista</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {(() => {
              const stats = items.reduce((acc, item) => {
                const u = Number(item.totalUnits) || 0;
                if (item.status === 'factory') acc.factory += u;
                if (item.status === 'transit') acc.transit += u;
                acc.total += u;
                return acc;
              }, { factory: 0, transit: 0, total: 0 });
              
              const pFactory = stats.total > 0 ? Math.round((stats.factory / stats.total) * 100) : 0;
              const pTransit = stats.total > 0 ? Math.round((stats.transit / stats.total) * 100) : 0;

              return (
                <>
                  <div className="bg-orange-50 border border-orange-100 p-4 rounded-3xl">
                    <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest">Em Fábrica</p>
                    <h4 className="text-xl font-black text-orange-600 tracking-tighter">{stats.factory.toLocaleString()} <span className="text-xs font-bold text-orange-400 ml-1">UNID.</span></h4>
                    <div className="mt-2 h-1 w-full bg-orange-200 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500" style={{ width: `${pFactory}%` }}></div>
                    </div>
                    <p className="text-[8px] font-bold text-orange-400 mt-1 uppercase">{pFactory}% do Total</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-3xl">
                    <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Em Trânsito</p>
                    <h4 className="text-xl font-black text-blue-600 tracking-tighter">{stats.transit.toLocaleString()} <span className="text-xs font-bold text-blue-400 ml-1">UNID.</span></h4>
                    <div className="mt-2 h-1 w-full bg-blue-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${pTransit}%` }}></div>
                    </div>
                    <p className="text-[8px] font-bold text-blue-400 mt-1 uppercase">{pTransit}% do Total</p>
                  </div>
                  <div className="bg-slate-900 p-4 rounded-3xl shadow-lg shadow-slate-200">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Inventory</p>
                    <h4 className="text-xl font-black text-white tracking-tighter">{stats.total.toLocaleString()} <span className="text-xs font-bold text-slate-500 ml-1">UNID.</span></h4>
                    <div className="mt-2 flex gap-1 h-1 w-full rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500" style={{ width: `${pFactory}%` }}></div>
                      <div className="h-full bg-blue-500" style={{ width: `${pTransit}%` }}></div>
                    </div>
                    <p className="text-[8px] font-bold text-slate-500 mt-1 uppercase">100% Volume Unificado</p>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 overflow-hidden">
            <div className="border-b border-slate-100 pb-4 mb-4 flex justify-between items-center">
              <div className="flex gap-4 items-center">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Intelligence Hub</h2>
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <button 
                    onClick={() => setActiveTab('timeline')}
                    className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Timeline
                  </button>
                  <button 
                    onClick={() => setActiveTab('analytics')}
                    className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'analytics' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Analytics
                  </button>
                </div>
              </div>
              <div className="flex gap-4 items-center mt-3">
                <div className="flex gap-1.5 items-center text-[9px] font-black tracking-widest text-slate-400">
                  <div className="w-5 h-5 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-200 shadow-sm">
                    <Factory size={10} />
                  </div>
                  FACTORY
                </div>
                <div className="flex gap-1.5 items-center text-[9px] font-black tracking-widest text-slate-400">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-200 shadow-sm">
                    <Ship size={10} />
                  </div>
                  TRANSIT
                </div>
                <div className="flex gap-1.5 items-center text-[9px] font-black tracking-widest text-slate-400">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center border border-emerald-200 shadow-sm">
                    <Anchor size={10} />
                  </div>
                  ARRIVED
                </div>
                <div className="flex gap-1.5 items-center text-[9px] font-black tracking-widest text-slate-400 border-l border-slate-100 pl-4">
                  * TBA = TO BE ANNOUNCED (A DEFINIR)
                </div>
          </div>
        </div>
            {activeTab === 'timeline' ? (
              <>
                <div className="overflow-x-auto mb-10">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 mt-2">Relatório Detalhado</h3>
                  <table className="w-full text-left text-sm text-slate-600">
                     <thead className="text-[10px] text-slate-400 font-black uppercase tracking-widest bg-slate-50">
                       <tr>
                         <th className="px-6 py-4 rounded-l-2xl">Container</th>
                         <th className="px-6 py-4">Descrição</th>
                         <th className="px-6 py-4">Pkgs</th>
                         <th className="px-6 py-4">Peso (GWK)</th>
                         <th className="px-6 py-4">CBM</th>
                         <th className="px-6 py-4">ETA</th>
                         <th className="px-6 py-4 rounded-r-2xl">Status</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                       {items.map(item => (
                         <tr key={item.id} className="hover:bg-slate-50/50 transition-all group">
                           <td className="px-4 py-3">
                             <input 
                               value={item.containers} 
                               onChange={e => updateItem(item.id, 'containers', e.target.value)}
                               className="w-full bg-transparent font-black text-xs text-slate-800 outline-none uppercase placeholder:text-slate-300"
                               placeholder="Container"
                             />
                           </td>
                           <td className="px-4 py-3">
                             <input 
                               value={item.description} 
                               onChange={e => updateItem(item.id, 'description', e.target.value)}
                               className="w-full bg-transparent text-xs font-bold text-slate-500 outline-none placeholder:text-slate-300"
                               placeholder="Descrição"
                             />
                           </td>
                           <td className="px-4 py-3 text-xs font-bold text-slate-500">{item.packages || '0'}</td>
                           <td className="px-4 py-3 text-xs font-bold text-slate-500">{item.weight || '0'}</td>
                           <td className="px-4 py-3 text-xs font-bold text-slate-500">{item.cbm || '0'}</td>
                           <td className="px-4 py-3">
                             <input 
                               type="date"
                               value={item.etaDate || ''} 
                               onChange={e => updateItem(item.id, 'etaDate', e.target.value)}
                               className="w-full bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer"
                             />
                           </td>
                           <td className="px-4 py-3">
                             <select 
                               value={item.status}
                               onChange={e => updateItem(item.id, 'status', e.target.value as any)}
                               className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer appearance-none text-center
                                 ${item.status === 'arrived' ? 'bg-emerald-100 text-emerald-700' : item.status === 'transit' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}
                             >
                               <option value="factory">FACTORY</option>
                               <option value="transit">TRANSIT</option>
                               <option value="arrived">ARRIVED</option>
                             </select>
                           </td>
                         </tr>
                       ))}
                       {items.length === 0 && (
                         <tr>
                           <td colSpan={7} className="text-center py-20 text-slate-300">
                             <Truck size={48} className="mx-auto mb-4 opacity-50" />
                             <p className="text-xs font-black uppercase tracking-widest">Nenhum lote extraído</p>
                           </td>
                         </tr>
                       )}
                     </tbody>
                  </table>
                </div>

                <div className="relative pt-6 min-h-[300px]">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-orange-500 border-l-2 border-dashed border-orange-500 z-0"></div>
                  <div className="absolute left-1/3 -top-6 -translate-x-1/2 text-[10px] font-black text-orange-600 uppercase bg-white px-2 z-10">TODAY</div>

                  <div className="space-y-4 relative z-10">
                      {(() => {
                        const timelineAggregated = items.reduce((acc: (ScheduleItem & { products: string[] })[], item) => {
                          const gKey = getGroupKey(item.containers);
                          const existing = acc.find(i => getGroupKey(i.containers) === gKey);
                          if (existing) {
                            if (!existing.products.includes(item.description)) {
                              existing.products.push(item.description);
                            }
                          } else {
                            acc.push({ ...item, products: [item.description] });
                          }
                          return acc;
                        }, []);

                        return timelineAggregated.map(item => {
                          const groupName = getGroupKey(item.containers);
                          let itemDate = item.etaDate ? new Date(item.etaDate) : new Date();
                          if (!item.etaDate) itemDate.setDate(itemDate.getDate() + 45); 
                          itemDate.setHours(0,0,0,0);
                          const todayDate = new Date();
                          todayDate.setHours(0,0,0,0);
                          
                          const isGreen = item.status === 'arrived';
                          const isYellow = item.status === 'transit';
                          const isOrangeBar = item.status === 'factory';
                          
                          const msPerDay = 1000 * 60 * 60 * 24;
                          const daysDiff = (itemDate.getTime() - todayDate.getTime()) / msPerDay;
                          const futureRatio = Math.max(0, Math.min(daysDiff, 90)) / 90;
                          
                          let barBgColor = "";
                          let labelColorClass = "";
                          let barStyle: React.CSSProperties = {};
                          
                          if (isGreen) {
                             barBgColor = "bg-emerald-500";
                             labelColorClass = "text-emerald-600";
                             barStyle = { width: '15%' };
                          } else if (isYellow) {
                             barBgColor = "bg-blue-500";
                             labelColorClass = "text-blue-600";
                             barStyle = { width: daysDiff > 0 ? `${33.33 + (futureRatio * 60)}%` : '33.33%' };
                          } else if (isOrangeBar) {
                             barBgColor = "bg-orange-500";
                             labelColorClass = "text-orange-600";
                             barStyle = { width: `${Math.max(10, futureRatio * 60)}%`, marginLeft: '33.33%' };
                          }
                          
                          return (
                            <div key={item.id} className="relative flex items-center gap-6">
                              <div className="w-1/4 text-right shrink-0 p-2 rounded-lg flex flex-col justify-center">
                                <h4 className="text-xs font-black text-slate-800 break-words uppercase leading-tight">
                                  CTN: {groupName} ({countContainers(groupName)})
                                </h4>
                                <p className="text-[8px] font-bold text-slate-400 uppercase truncate mt-0.5 leading-none" title={item.products.join(', ')}>
                                  {item.products.join(', ')}
                                </p>
                              </div>
                              
                              <div className="w-3/4 relative h-8 flex items-center">
                                <div className="absolute inset-0 bg-slate-50 rounded-r-xl"></div>
                                
                                <div className={`relative h-4 rounded-r-md flex items-center justify-end px-3 transition-all ${barBgColor}`} style={barStyle}>
                                   <span className={`text-[10px] font-black translate-x-[110%] absolute right-0 ${labelColorClass}`}>
                                     {item.status === 'factory' && !item.etaDate ? 'TBA (PRODUÇÃO)' : item.status === 'factory' ? 'FACTORY' : item.etaDate ? item.etaDate.split('-').reverse().join('/') : 'TBA'}
                                   </span>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-6 space-y-8">
                <div className="grid grid-cols-2 gap-8 mb-4">
                  <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Inventory Share by Product</h4>
                    <div className="space-y-4">
                      {(() => {
                        const productAgg = items.reduce((acc: any, item) => {
                          const desc = item.description.trim().toUpperCase();
                          if (!acc[desc]) acc[desc] = { total: 0, transit: 0, factory: 0 };
                          const u = Number(item.totalUnits) || 0;
                          acc[desc].total += u;
                          if (item.status === 'transit') acc[desc].transit += u;
                          if (item.status === 'factory') acc[desc].factory += u;
                          return acc;
                        }, {});

                        const totalOverall = Object.values(productAgg).reduce((sum: number, p: any) => sum + p.total, 0) as number;
                        
                        return Object.entries(productAgg)
                          .sort(([, a]: any, [, b]: any) => b.total - a.total)
                          .map(([name, stats]: any) => {
                            const pct = totalOverall > 0 ? (stats.total / totalOverall) * 100 : 0;
                            const pTransit = stats.total > 0 ? (stats.transit / stats.total) * 100 : 0;
                            const pFactory = stats.total > 0 ? (stats.factory / stats.total) * 100 : 0;

                            return (
                              <div key={name} className="space-y-1">
                                <div className="flex justify-between items-end">
                                  <span className="text-[10px] font-black text-slate-700 uppercase truncate max-w-[200px]">{name}</span>
                                  <span className="text-[10px] font-black text-slate-400">{stats.total.toLocaleString()} units ({pct.toFixed(1)}%)</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(stats.transit / totalOverall) * 100}%` }} title="Transit"></div>
                                  <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${(stats.factory / totalOverall) * 100}%` }} title="Factory"></div>
                                </div>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 bg-slate-900 rounded-[32px] text-white">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Supply Chain Health</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"></div>
                            <span className="text-[10px] font-black uppercase">Em Trânsito (Azul)</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">Navios / Caminhões</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50"></div>
                            <span className="text-[10px] font-black uppercase">Em Produção (Laranja)</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">Em Fábrica / Pedido</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 border-2 border-dashed border-slate-100 rounded-[32px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase text-center leading-relaxed">
                        Os dados acima são calculados em tempo real com base no Total de Unidades inserido em cada lote. 
                        A ordenação prioriza produtos com maior impacto no inventário total.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
