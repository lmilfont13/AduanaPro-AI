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

  // Busca taxa de câmbio automática
  useEffect(() => {
    if (!exchangeRate) {
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        .then(res => res.json())
        .then(json => {
          const rate = parseFloat(json.USDBRL.bid);
          setExchangeRate(rate);
          onUpdate({ ...safeData, exchangeRate: rate });
        })
        .catch(() => console.error("Falha ao buscar dólar"));
    }
  }, []);

  // Sincroniza estados locais quando os dados externos mudam
  useEffect(() => {
    if (data?.bankDetails !== undefined) setBankDetails(data.bankDetails);
    if (data?.paymentTerms !== undefined) setPaymentTermsInput(data.paymentTerms);
    if (data?.recipientName !== undefined) setRecipientName(data.recipientName);
    if (data?.exchangeRate !== undefined) setExchangeRate(data.exchangeRate);
    if (data?.bankImage !== undefined) setBankImage(data.bankImage);
    if (data?.productImage !== undefined) setProductImage(data.productImage);
  }, [data]);

  const safeData = useMemo(() => ({
    supplierName: data?.supplierName || "",
    paymentTerms: data?.paymentTerms || "",
    bankDetails: data?.bankDetails || "",
    recipientName: data?.recipientName || "Eveline",
    exchangeRate: Number(data?.exchangeRate || exchangeRate || 0),
    contractTotal: Number(data?.contractTotal || 0),
    ciNumber: data?.ciNumber || "",
    containerNumber: data?.containerNumber || "",
    productName: data?.productName || productName || "",
    currency: data?.currency || "USD",
    orderDate: data?.orderDate || orderDate,
    productionDays: Number(data?.productionDays || productionDays || 30),
    bankImage: data?.bankImage || bankImage || null,
    productImage: data?.productImage || productImage || null,
    milestones: Array.isArray(data?.milestones) ? data.milestones.map((m: any) => ({
      ...m,
      id: m.id || Math.random().toString(36).substring(2, 9),
      date: m.date || new Date().toISOString().split('T')[0],
      amount: Number(m.amount || 0),
      percentage: Number(m.percentage || 0)
    })) : []
  }), [data, exchangeRate, orderDate, productionDays]);

  const totalPaid = useMemo(() => safeData.milestones.filter(m => m.isPaid).reduce((sum, m) => sum + (m.amount || 0), 0), [safeData.milestones]);
  const balanceDue = Math.max(0, safeData.contractTotal - totalPaid);

  const applyPaymentTerms = () => {
    if (!paymentTermsInput) return;
    const parts = paymentTermsInput.split(/[\/,;-]+/).map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
    
    if (parts.length === 0) {
      toast.error("Formato de termo inválido. Use 30/70, 20/80, etc.");
      return;
    }
    
    const totalPercentage = parts.reduce((a, b) => a + b, 0);
    const baseDate = new Date(orderDate + 'T12:00:00');
    
    const newMilestones = parts.map((percent, index) => {
      const normalizedPercent = (percent / totalPercentage) * 100;
      
      const milestoneDate = new Date(baseDate);
      if (index > 0) {
        // Se houver mais de uma parcela, a última geralmente é no final da produção
        const daysToAdd = index === parts.length - 1 ? productionDays : Math.floor((productionDays / (parts.length - 1)) * index);
        milestoneDate.setDate(baseDate.getDate() + daysToAdd);
      }
      
      return {
        id: Math.random().toString(36).substring(2, 9),
        description: index === 0 ? "Sinal (Advance)" : (index === parts.length - 1 ? "Saldo Final (Balance)" : `Parcela Intermediária ${index}`),
        percentage: normalizedPercent,
        amount: (safeData.contractTotal * normalizedPercent) / 100,
        isPaid: false,
        date: milestoneDate.toISOString().split('T')[0]
      };
    });

    onUpdate({ ...safeData, paymentTerms: paymentTermsInput, milestones: newMilestones });
    toast.success("Parcelas sincronizadas com o tempo de produção!");
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    const updated = safeData.milestones.map(m => {
      if (m.id !== id) return m;
      const newM = { ...m, ...updates };
      if (updates.percentage !== undefined) {
        newM.amount = (safeData.contractTotal * updates.percentage) / 100;
      } else if (updates.amount !== undefined && safeData.contractTotal > 0) {
        newM.percentage = (updates.amount / safeData.contractTotal) * 100;
      }
      return newM;
    });
    onUpdate({ ...safeData, milestones: updated });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]; if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { 
        reader.onload = () => resolve((reader.result as string).split(',')[1]); 
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      const pdfText = file.type === "application/pdf" ? await extractTextFromPDF(base64) : "";
      const aiData = await parsePaymentReceiptWithGroq(base64, file.type, pdfText);
      
      const parseVal = (v: any) => {
        if (v === undefined || v === null || v === "") return 0;
        let str = v.toString().trim().replace(/[^\d,.]/g, '');
        
        // Se houver múltiplos separadores, o último costuma ser o decimal
        const lastDot = str.lastIndexOf('.');
        const lastComma = str.lastIndexOf(',');
        
        if (lastComma > lastDot) {
          // Formato BR: 1.234,56 ou 1234,56
          str = str.replace(/\./g, '').replace(',', '.');
        } else if (lastDot > lastComma) {
          // Formato US: 1,234.56 ou 1234.56
          // Mas cuidado com 1.234 (pode ser mil ou decimal)
          // Se houver vírgula antes, é milhar.
          if (lastComma !== -1) {
            str = str.replace(/,/g, '');
          } else {
            // Se só tem ponto, e tem 3 casas depois, provavelmente é milhar (ex: 12.150)
            const parts = str.split('.');
            if (parts.length === 2 && parts[1].length === 3) {
              str = str.replace('.', '');
            }
          }
        }
        return parseFloat(str) || 0;
      };

      const total = parseVal(aiData.contractTotal) || safeData.contractTotal;

      onUpdate({
        ...safeData,
        supplierName: aiData.supplierName || safeData.supplierName,
        ciNumber: aiData.ciNumber || safeData.ciNumber,
        containerNumber: aiData.containerNumber || safeData.containerNumber,
        productName: aiData.productName || safeData.productName,
        contractTotal: total,
        bankDetails: aiData.bankDetails || bankDetails || safeData.bankDetails,
        recipientName: recipientName || safeData.recipientName,
        milestones: (aiData.milestones || []).map((m: any) => ({
          ...m,
          id: Math.random().toString(36).substring(2, 9),
          date: m.date || new Date().toISOString().split('T')[0],
          isPaid: m.isPaid === true || m.isPaid === 'true',
          amount: parseVal(m.amount) || (total * (parseVal(m.percentage) || 0)) / 100
        }))
      });
      if (aiData.bankDetails) setBankDetails(aiData.bankDetails);
      if (aiData.productName) setProductName(aiData.productName);
      toast.success("Dados da CI extraídos e traduzidos!");
    } catch (e: any) {
      toast.error("Erro na extração: " + e.message);
    } finally { setLoading(false); }
  }, [safeData, onUpdate, bankDetails, recipientName]);

  const onDropBank = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]; if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => { 
        reader.onload = () => resolve((reader.result as string).split(',')[1]); 
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      const pdfText = file.type === "application/pdf" ? await extractTextFromPDF(base64) : "";
      
      const prompt = `Extraia APENAS os dados bancários deste documento (Beneficiary, SWIFT, Account, Bank Name, Address). Retorne em formato de lista textual limpa. Texto extraído: ${pdfText}`;
      
      // Corrigindo callAI para usar o serviço Groq disponível
      const aiData = await parsePaymentReceiptWithGroq(base64, file.type, pdfText);
      
      const extractedText = aiData.bankDetails || "Dados extraídos via IA...";
      setBankDetails(extractedText);
      const fullBase64 = `data:${file.type};base64,${base64}`;
      setBankImage(fullBase64);
      onUpdate({ ...safeData, bankDetails: extractedText, bankImage: fullBase64 });
      toast.success("Dados bancários extraídos!");
    } catch (e: any) {
      toast.error("Erro na extração bancária: " + e.message);
    } finally { setLoading(false); }
  }, [safeData, onUpdate]);

  const { getRootProps: getBankRoot, getInputProps: getBankInput } = useDropzone({ onDrop: onDropBank });

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.includes("image")) {
          const file = items[i].getAsFile();
          if (!file) continue;
          
          // Se o cursor estiver na área de banco ou se não houver CI ainda, prioriza banco
          if (document.activeElement?.id === 'bank-details-area' || document.activeElement?.closest('[data-zone="bank"]')) {
             onDropBank([file]);
          } else {
             // Caso contrário, tenta ver se é foto do produto (se o foco estiver perto do nome do produto)
             const reader = new FileReader();
             reader.onload = (ev) => {
               const base64 = ev.target?.result as string;
               setProductImage(base64);
               onUpdate({ ...safeData, productImage: base64 });
               toast.success("Foto do produto adicionada!");
             };
             reader.readAsDataURL(file);
             onDrop([file]); // Mantém a extração de texto da CI também
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onDrop, onDropBank]);

  const [showMsg, setShowMsg] = useState(false);
  const [whatsappText, setWhatsappText] = useState("");

  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [history, setHistory] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY') || '[]'); } catch { return []; }
  });

  const saveRecord = async () => {
    if (!safeData.ciNumber && !safeData.supplierName) {
      toast.error("Informe pelo menos a Ref. Pedido / CI ou Fornecedor para salvar.");
      return;
    }
    
    setLoading(true);
    const recordId = safeData.ciNumber || safeData.supplierName || Math.random().toString(36).substring(2,9);
    
    // Objeto consolidado para salvamento
    const dataToSave = {
      ...safeData,
      productImage: productImage,
      bankImage: bankImage,
      updated_at: new Date().toISOString()
    };

    const newRecord = {
      id: recordId,
      dateSaved: new Date().toISOString(),
      data: dataToSave
    };
    
    // 1. Salvamento Local (Cache Rápido)
    try {
      const existingIndex = history.findIndex(h => h.id === recordId);
      let newHistory = [...history];
      if (existingIndex >= 0) {
        newHistory[existingIndex] = newRecord;
      } else {
        newHistory.push(newRecord);
      }
      setHistory(newHistory);
      localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
    } catch (e) {
      console.warn("LocalStorage lotou, tentando apenas Supabase...");
    }

    // 2. Salvamento na Nuvem (Supabase)
    if (IS_SUPABASE_CONFIGURED) {
      try {
        const { error } = await supabase
          .from('supplier_payments')
          .upsert({
            id: recordId,
            supplier_name: safeData.supplierName,
            ci_number: safeData.ciNumber,
            contract_total: safeData.contractTotal,
            data: dataToSave,
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
        toast.success("Sincronizado com a Nuvem Supabase! ☁️");
      } catch (e: any) {
        console.error("Erro Supabase:", e);
        toast.error("Erro ao salvar na nuvem: " + (e.message || "Tabela não encontrada"));
      }
    } else {
      toast.info("Salvo apenas localmente (Supabase não configurado).");
    }
    
    setLoading(false);
  };

  const loadRecord = (recordData: any) => {
    onUpdate(recordData);
    setShowHistory(false);
    toast.success("Registro carregado!");
  };

  const deleteRecord = (id: string) => {
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(newHistory));
    toast.success("Registro excluído!");
  };

  const exportFinanceData = () => {
    const dataToExport = {
      currentPayment: safeData,
      history: JSON.parse(localStorage.getItem('ADUANAPRO_PAYMENTS_HISTORY') || '[]'),
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AduanaPro_Finance_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success("Backup financeiro exportado!");
  };

  const importFinanceData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.currentPayment) {
          onUpdate(data.currentPayment);
        }
        if (data.history) {
          setHistory(data.history);
          localStorage.setItem('ADUANAPRO_PAYMENTS_HISTORY', JSON.stringify(data.history));
        }
        toast.success("Backup financeiro importado com sucesso!");
      } catch (err) {
        toast.error("Erro ao importar backup financeiro.");
      }
    };
    reader.readAsText(file);
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Logo (se existir)
      if (customLogo) {
        try {
          doc.addImage(customLogo, 'PNG', pageWidth / 2 - 15, 10, 30, 15);
        } catch (e) { console.error("Logo error", e); }
      }

      // Cabeçalho Centralizado
      doc.setTextColor(30, 41, 59); // Slate 800
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("Payment Status Report", pageWidth / 2, 35, { align: 'center' });
      
      doc.setTextColor(249, 115, 22); // Orange 500
      doc.setFontSize(9);
      doc.text("OFFICIAL ORDER VERIFICATION", pageWidth / 2, 42, { align: 'center' });
      
      doc.setDrawColor(241, 245, 249);
      doc.line(20, 45, pageWidth - 20, 45);

      // Dados do Fornecedor e Referência
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.text(safeData.supplierName || "SUPPLIER NAME NOT INFORMED", 20, 60);
      
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.setFontSize(9);
      doc.text(`REFERENCE: ${safeData.ciNumber || "N/I"}`, 20, 66);
      
      // Contract Total (Direita)
      doc.setTextColor(148, 163, 184);
      doc.text("CONTRACT TOTAL", pageWidth - 20, 60, { align: 'right' });
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(16);
      doc.text(`USD ${(safeData.contractTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, pageWidth - 20, 68, { align: 'right' });

      // Cards de Resumo
      const cardWidth = (pageWidth - 50) / 2;
      
      // Card Total Paid (Verde)
      doc.setFillColor(240, 253, 244); // Emerald 50
      doc.roundedRect(20, 80, cardWidth, 40, 4, 4, 'F');
      doc.setTextColor(5, 150, 105); // Emerald 600
      doc.setFontSize(8);
      doc.text("TOTAL PAID", 30, 90);
      doc.text(`${((totalPaid / safeData.contractTotal) * 100 || 0).toFixed(1)}%`, 20 + cardWidth - 10, 90, { align: 'right' });
      doc.setFontSize(18);
      doc.text(`USD ${(totalPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, 30, 105);
      doc.setDrawColor(16, 185, 129); // Emerald 500
      doc.setLineWidth(2);
      doc.line(30, 112, 30 + (cardWidth - 20) * (totalPaid / safeData.contractTotal || 0), 112);

      // Card Remaining Balance (Vermelho)
      doc.setFillColor(254, 242, 242); // Rose 50
      doc.roundedRect(pageWidth - 20 - cardWidth, 80, cardWidth, 40, 4, 4, 'F');
      doc.setTextColor(225, 29, 72); // Rose 600
      doc.setFontSize(8);
      doc.text("REMAINING BALANCE", pageWidth - cardWidth - 10, 90);
      doc.text(`${((balanceDue / safeData.contractTotal) * 100 || 0).toFixed(1)}%`, pageWidth - 30, 90, { align: 'right' });
      doc.setFontSize(18);
      doc.text(`USD ${(balanceDue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, pageWidth - cardWidth - 10, 105);
      doc.setDrawColor(244, 63, 94); // Rose 500
      doc.setLineWidth(2);
      doc.line(pageWidth - cardWidth - 10, 112, pageWidth - cardWidth - 10 + (cardWidth - 20) * (balanceDue / safeData.contractTotal || 0), 112);

      // Tabela Payment Ledger
      let y = 140;
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("PAYMENT LEDGER", 20, y);
      doc.text(`Paid: USD ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, pageWidth - 20, y, { align: 'right' });
      
      y += 10;
      doc.setFillColor(248, 250, 252);
      doc.rect(20, y, pageWidth - 40, 10, 'F');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("DATE", 25, y + 6);
      doc.text("DESCRIPTION/MILESTONE", 60, y + 6);
      doc.text("SHARE", 140, y + 6);
      doc.text("USD VALUE", pageWidth - 25, y + 6, { align: 'right' });

      doc.setFont("helvetica", "normal");
      safeData.milestones.forEach((m) => {
        y += 15;
        if (y > 250) { doc.addPage(); y = 20; }
        
        if (m.isPaid) {
          doc.setFillColor(240, 253, 244); // Emerald 50
          doc.rect(20, y - 9, pageWidth - 40, 16, 'F');
        }

        doc.setFont("helvetica", "bold");
        doc.setTextColor(m.isPaid ? 5 : 30, m.isPaid ? 150 : 41, m.isPaid ? 105 : 59);
        doc.text(m.date || "---", 25, y);
        
        doc.setFont("helvetica", m.isPaid ? "bold" : "normal");
        doc.text(m.description || "Milestone", 60, y);
        doc.text(`${(m.percentage || 0).toFixed(1)}%`, 140, y);
        
        doc.setFont("helvetica", "bold");
        doc.text(`USD ${m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, pageWidth - 25, y, { align: 'right' });
        
        doc.setFont("helvetica", "normal");
        if (m.isPaid) {
          doc.setTextColor(16, 185, 129); // Emerald 500
        } else {
          doc.setTextColor(148, 163, 184); // Slate 400
        }
        doc.setFontSize(7);
        doc.text(m.isPaid ? "CONFIRMED PAID" : "PENDING LIQUIDATION", 25, y + 4);
        doc.setFontSize(8);
      });

      // Footer Final Remaining Balance
      y += 25;
      if (y > 240) { doc.addPage(); y = 40; }
      
      const footerBoxWidth = (pageWidth - 40) / 2;
      const leftContentRightEdge = 20 + footerBoxWidth - 5; // End of gray box minus padding
      
      doc.setFillColor(248, 250, 252);
      doc.rect(20, y, pageWidth - 40, 40, 'F');
      
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text("CONTRACT TOTAL:", 25, y + 15);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`USD ${safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, leftContentRightEdge, y + 15, { align: 'right' });
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text("TOTAL PAID (LIQ.):", 25, y + 25);
      doc.setTextColor(5, 150, 105);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`USD ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} (${((totalPaid/(safeData.contractTotal || 1))*100).toFixed(1)}%)`, leftContentRightEdge, y + 25, { align: 'right' });

      // Box Vermelho de Saldo Final
      doc.setFillColor(244, 63, 94); // Rose 500
      doc.rect(pageWidth - 20 - footerBoxWidth, y, footerBoxWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text("FINAL REMAINING BALANCE", pageWidth - 20 - (footerBoxWidth/2), y + 15, { align: 'center' });
      doc.setFontSize(18);
      doc.text(`USD ${balanceDue.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}`, pageWidth - 20 - (footerBoxWidth/2), y + 30, { align: 'center' });

      doc.save(`Payment_Status_Report_${safeData.supplierName || "Aduana"}.pdf`);
    } catch (e) { toast.error("Erro ao gerar PDF"); }
  };

  const generateConsolidatedReport = () => {
    const selectedRecords = history.filter(h => selectedHistoryIds.includes(h.id));
    if (selectedRecords.length === 0) {
      toast.error("Selecione pelo menos um registro para o resumo.");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header Corporativo
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text("RELATÓRIO GERENCIAL", 20, 25);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`AUDITORIA FINANCEIRA CONSOLIDADA | ${selectedRecords.length} PROCESSOS`, 20, 32);
      doc.text(`${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth - 20, 32, { align: 'right' });

      let totalContract = 0;
      let totalPaid = 0;
      
      selectedRecords.forEach(h => {
        totalContract += Number(h.data.contractTotal || 0);
        const paid = h.data.milestones?.filter((m: any) => m.isPaid).reduce((s: number, m: any) => s + Number(m.amount || 0), 0) || 0;
        totalPaid += paid;
      });
      
      const totalBalance = totalContract - totalPaid;

      // Resumo Executivo
      let y = 55;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("RESUMO EXECUTIVO DO PORTFÓLIO", 20, y);
      
      y += 10;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(20, y, pageWidth - 40, 35, 3, 3, 'F');
      
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("VALOR TOTAL DOS CONTRATOS", 30, y + 10);
      doc.text("TOTAL LIQUIDADO", 30, y + 25);
      doc.text("SALDO REMANESCENTE", pageWidth - 30, y + 10, { align: 'right' });

      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`USD ${totalContract.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 30, y + 18);
      doc.setTextColor(16, 185, 129);
      doc.text(`USD ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 30, y + 32);
      doc.setTextColor(244, 63, 94);
      doc.text(`USD ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 30, y + 18, { align: 'right' });

      // Detalhamento Detalhado
      y += 55;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.text("DETALHAMENTO POR PROCESSO", 20, y);
      
      y += 5;
      selectedRecords.forEach((h, index) => {
        if (y > 230) { doc.addPage(); y = 20; }
        
        doc.setDrawColor(226, 232, 240);
        doc.line(20, y, pageWidth - 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`${index + 1}. ${h.data.supplierName || "FORNECEDOR N/I"}`, 20, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Ref: ${h.data.ciNumber || "N/I"} | Produto: ${h.data.productName || "N/I"}`, 20, y + 5);
        
        y += 12;
        // Cabeçalho Tabela de Parcelas
        doc.setFillColor(241, 245, 249);
        doc.rect(20, y, pageWidth - 40, 6, 'F');
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("DATA VENC.", 25, y + 4);
        doc.text("PARCELA", 55, y + 4);
        doc.text("VALOR (USD)", 95, y + 4);
        doc.text("%", 135, y + 4);
        doc.text("STATUS", 165, y + 4);
        
        y += 10;
        h.data.milestones?.forEach((m: any, mIdx: number) => {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 41, 59);
          const pct = ((m.amount / (h.data.contractTotal || 1)) * 100).toFixed(0);
          
          doc.text(m.date ? new Date(m.date).toLocaleDateString('pt-BR') : "N/I", 25, y);
          doc.text(`PARCELA ${mIdx + 1}`, 55, y);
          doc.text(Number(m.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 95, y);
          doc.text(`${pct}%`, 135, y);
          
          if (m.isPaid) {
            doc.setTextColor(16, 185, 129);
            doc.text("LIQUIDADO", 165, y);
          } else {
            doc.setTextColor(244, 63, 94);
            doc.text("PENDENTE", 165, y);
          }
          
          doc.setTextColor(30, 41, 59);
          y += 6;
        });
        
        y += 10;
      });

      doc.save(`Relatorio_Gerencial_AduanaPro_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Relatório gerencial detalhado gerado!");
    } catch (e) { toast.error("Erro ao gerar relatório."); }
  };

  const generateMonthlyFlowReport = () => {
    const selectedRecords = history.filter(h => selectedHistoryIds.includes(h.id));
    if (selectedRecords.length === 0) {
      toast.error("Selecione pelo menos um registro para o fluxo mensal.");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("FLUXO DE CAIXA MENSAL", 20, 25);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("CONSOLIDADO DE PAGAMENTOS PENDENTES POR PERÍODO", 20, 32);

      // Agrupamento
      const monthlyData: { [key: string]: { total: number; items: any[] } } = {};
      
      selectedRecords.forEach(h => {
        h.data.milestones?.forEach((m: any) => {
          if (!m.isPaid && m.date) {
            const date = new Date(m.date + 'T12:00:00');
            const key = `${date.toLocaleString('pt-BR', { month: 'long' }).toUpperCase()} / ${date.getFullYear()}`;
            if (!monthlyData[key]) monthlyData[key] = { total: 0, items: [] };
            monthlyData[key].total += Number(m.amount || 0);
            monthlyData[key].items.push({ ...m, supplier: h.data.supplierName, ref: h.data.ciNumber, product: h.data.productName });
          }
        });
      });

      let y = 55;
      const months = Object.keys(monthlyData).sort((a, b) => {
        const [mA, yA] = a.split(' / ');
        const [mB, yB] = b.split(' / ');
        const dateA = new Date(`${mA} 1, ${yA}`);
        const dateB = new Date(`${mB} 1, ${yB}`);
        return dateA.getTime() - dateB.getTime();
      });

      if (months.length === 0) {
        doc.setTextColor(100, 116, 139);
        doc.text("Não há pagamentos pendentes nos registros selecionados.", 20, y);
      }

      months.forEach(month => {
        if (y > 240) { doc.addPage(); y = 20; }
        
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(20, y, pageWidth - 40, 10, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(month, 25, y + 6.5);
        doc.setTextColor(244, 63, 94);
        doc.text(`TOTAL: USD ${monthlyData[month].total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 25, y + 6.5, { align: 'right' });
        
        y += 15;
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("DATA", 25, y);
        doc.text("FORNECEDOR / REFERÊNCIA", 50, y);
        doc.text("PRODUTO", 110, y);
        doc.text("VALOR (USD)", pageWidth - 25, y, { align: 'right' });
        
        y += 5;
        doc.setDrawColor(241, 245, 249);
        doc.line(20, y, pageWidth - 20, y);
        y += 5;

        monthlyData[month].items.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(item => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 41, 59);
          doc.text(new Date(item.date).toLocaleDateString('pt-BR'), 25, y);
          doc.setFont("helvetica", "bold");
          doc.text(`${item.supplier || "N/I"}`, 50, y);
          doc.setFont("helvetica", "normal");
          doc.text(`Ref: ${item.ref || "N/I"}`, 50, y + 4);
          doc.text(item.product || "N/I", 110, y);
          doc.setFont("helvetica", "bold");
          doc.text(Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), pageWidth - 25, y, { align: 'right' });
          y += 10;
        });
        
        y += 10;
      });

      doc.save(`Fluxo_Mensal_AduanaPro_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Fluxo de caixa mensal gerado!");
    } catch (e) { toast.error("Erro ao gerar fluxo mensal."); }
  };

  const shareWhatsApp = () => {
    const pending = safeData.milestones.filter(m => !m.isPaid);
    
    // Cálculo da Previsão de Embarque (Data do Pedido + Produção + Margem de 10 dias)
    const etdDate = (() => {
      try {
        const d = new Date(orderDate + 'T12:00:00');
        if (isNaN(d.getTime())) return "A definir";
        d.setDate(d.getDate() + (Number(productionDays) || 0) + 10);
        return d.toLocaleDateString('pt-BR');
      } catch { return "A definir"; }
    })();

    const cleanTag = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '');
    const refTag = cleanTag(safeData.ciNumber) || "Naoespecificado";

    let text = `💼 *SOLICITAÇÃO DE PAGAMENTO* - ${safeData.supplierName || "FORNECEDOR N/I"}\n\n` +
               `${recipientName ? `${recipientName}, bom dia! 🏦 ` : "Bom dia! 🏦 "}gostaria de formalizar o pedido de lançamento de câmbio conforme abaixo:\n` +
               `Ref. Pedido: ${safeData.ciNumber || "Não especificado"} 📄\n` +
               `Containers: ${safeData.containerNumber || "Não especificado"}\n` +
               `Produto: ${safeData.productName || "Não especificado"}\n` +
               `*Previsão de Embarque: ${etdDate}* 🚢\n` +
               `----------------------------------\n` +
               `*VALOR TOTAL DO CONTRATO: 💰 ${safeData.currency} ${safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${safeData.exchangeRate > 0 ? ` (R$ ${(safeData.contractTotal * safeData.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : ""}*\n` +
               `TOTAL JÁ LIQUIDADO: ${safeData.currency} ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${((totalPaid/(safeData.contractTotal || 1))*100).toFixed(1)}%)\n` +
               `SALDO REMANESCENTE: ${safeData.currency} ${balanceDue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${((balanceDue/(safeData.contractTotal || 1))*100).toFixed(1)}%)\n\n`;

    if (safeData.milestones.length > 0) {
      text += `*PARCELAS:*\n` +
              safeData.milestones.map(m => {
                const pct = ((m.amount / (safeData.contractTotal || 1)) * 100).toFixed(0);
                const status = m.isPaid ? "✅ PAGO" : "⏳ A PAGAR";
                const d = new Date(m.date + 'T12:00:00');
                const formattedDate = isNaN(d.getTime()) ? m.date : d.toLocaleDateString('pt-BR');
                return `• Vencimento: ${formattedDate} | Valor: ${safeData.currency} ${m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pct}%) | ${status}`;
              }).join('\n') +
              `\n\n`;
    }

    if (bankDetails) {
      text += `🏦 *DADOS BANCÁRIOS / OBSERVAÇÕES:*\n${bankDetails}\n\n`;
    }

    text += `Fico no aguardo do comprovante de pagamento, obrigado! 🤝\n\n#Pagamento_${refTag}_`;
    
    setWhatsappText(text);
    setShowMsg(true);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 relative">
      {showMsg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase">Solicitação de Pagamento</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Copie e envie ao seu fornecedor</p>
              </div>
              <button onClick={() => setShowMsg(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-all">×</button>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mensagem de Texto</label>
                  <textarea 
                    readOnly 
                    value={whatsappText} 
                    className="w-full h-80 p-6 bg-slate-900 text-emerald-400 font-mono text-[10px] rounded-2xl border-none outline-none resize-none shadow-inner"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(whatsappText);
                      toast.success("Mensagem copiada!");
                    }}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    <FileText size={16} /> Copiar Mensagem
                  </button>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anexos (Produto / Banco)</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-80 bg-slate-100 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative group">
                      {productImage ? (
                        <>
                          <img src={productImage} alt="Prod" className="w-full h-full object-contain" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                             <span className="text-[8px] font-black text-white uppercase">Produto</span>
                          </div>
                        </>
                      ) : (
                         <span className="text-[8px] font-black text-slate-300 uppercase">Sem Foto Produto</span>
                      )}
                      <button 
                        disabled={!productImage}
                        onClick={async () => {
                          if (!productImage) return;
                          const res = await fetch(productImage);
                          const blob = await res.blob();
                          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                          toast.success("Foto do Produto copiada!");
                        }}
                        className="absolute bottom-4 left-4 right-4 py-2 bg-slate-900/80 text-white rounded-xl font-black uppercase text-[8px] backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Copiar Produto
                      </button>
                    </div>

                    <div className="h-80 bg-slate-100 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative group">
                      {bankImage ? (
                        <>
                          <img src={bankImage} alt="Bank" className="w-full h-full object-contain" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                             <span className="text-[8px] font-black text-white uppercase">Dados Bancários</span>
                          </div>
                        </>
                      ) : (
                         <span className="text-[8px] font-black text-slate-300 uppercase">Sem Foto Banco</span>
                      )}
                      <button 
                        disabled={!bankImage}
                        onClick={async () => {
                          if (!bankImage) return;
                          const res = await fetch(bankImage);
                          const blob = await res.blob();
                          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                          toast.success("Dados Bancários copiados!");
                        }}
                        className="absolute bottom-4 left-4 right-4 py-2 bg-slate-900/80 text-white rounded-xl font-black uppercase text-[8px] backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Copiar Banco
                      </button>
                    </div>
                  </div>
               </div>
            </div>
            <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dica: Cole o texto no WhatsApp e depois cole a imagem (Ctrl+V)</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-orange-500 shadow-xl">
             <DollarSign size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
               Fluxo de Pagamentos 
               <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[7px] font-black uppercase flex items-center gap-1">
                  <div className="w-1 h-1 bg-orange-500 rounded-full animate-pulse"></div> v2.1 LATEST
               </span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Controle de Pedido e Parcelas</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
            <button onClick={exportFinanceData} className="flex items-center gap-2 px-4 py-2 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-white hover:shadow-sm transition-all">
              Exportar Backup
            </button>
            <label className="flex items-center gap-2 px-4 py-2 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-white hover:shadow-sm transition-all cursor-pointer">
              Importar Backup
              <input type="file" className="hidden" accept=".json" onChange={importFinanceData} />
            </label>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-600 border border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all"
          >
            <FolderOpen size={16} /> Histórico
          </button>
          <button onClick={saveRecord} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">
            <Save size={16} /> Salvar
          </button>
          <button onClick={shareWhatsApp} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20">
            <MessageSquare size={16} /> Solicitar WhatsApp
          </button>
          <button onClick={generatePDF} className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20">
            <FileDown size={16} /> Baixar Relatório PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CI Dropzone */}
            <div {...getRootProps()} className="p-8 border-2 border-dashed border-slate-200 rounded-[32px] bg-white hover:border-orange-500 hover:bg-orange-50/10 transition-all text-center cursor-pointer group flex flex-col items-center justify-center">
              <input {...getInputProps()} />
              <Upload size={24} className="text-slate-200 group-hover:text-orange-500 mb-2" />
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Arraste a CI</p>
              {loading && <div className="mt-2 text-orange-600 text-[8px] font-black animate-pulse uppercase">IA...</div>}
            </div>

            {/* Foto do Produto */}
            <div className="p-4 bg-slate-900 rounded-[32px] space-y-2 border-2 border-orange-500/50 shadow-lg shadow-orange-500/10">
               <label className="text-[8px] font-black text-slate-500 uppercase tracking-[2px] block mb-1">Foto do Produto</label>
               <div className="h-32 bg-white/5 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group cursor-pointer hover:border-orange-500 hover:bg-white/10 transition-all">
                  {productImage ? (
                    <>
                      <img src={productImage} alt="Produto" className="w-full h-full object-contain" />
                      <button onClick={() => setProductImage(null)} className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12} /></button>
                    </>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const base64 = ev.target?.result as string;
                            setProductImage(base64);
                            onUpdate({ ...safeData, productImage: base64 });
                          };
                          reader.readAsDataURL(file);
                        }
                      }} />
                      <Plus size={24} className="text-orange-500" />
                      <span className="text-[8px] font-black text-white/40 uppercase">Colar Foto</span>
                    </label>
                  )}
               </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label>
              <input type="text" value={safeData.supplierName} onChange={(e) => onUpdate({...safeData, supplierName: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-orange-500/20" placeholder="Nome do Fornecedor" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ref. Pedido / CI</label>
                <input type="text" value={safeData.ciNumber} onChange={(e) => onUpdate({...safeData, ciNumber: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-orange-500/20" placeholder="Ex: CI-2024-001" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CTN (Ref. Interna)</label>
                <input type="text" value={safeData.containerNumber} onChange={(e) => onUpdate({...safeData, containerNumber: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-orange-500/20" placeholder="Ex: 1, 23, 34..." />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto (Extraído e Traduzido)</label>
              <input type="text" value={safeData.productName} onChange={(e) => { setProductName(e.target.value); onUpdate({...safeData, productName: e.target.value}); }} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-orange-500/20" placeholder="Descrição do Produto" />
              
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total do Pedido ({safeData.currency})</label>
                <input 
                  type="text" 
                  defaultValue={safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  key={`total-${safeData.contractTotal}`}
                  onBlur={(e) => {
                    const rawVal = e.target.value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
                    onUpdate({...safeData, contractTotal: parseFloat(rawVal) || 0});
                  }}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black outline-none focus:ring-2 ring-blue-500/20 font-mono-technical" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Câmbio Estimado (R$)</label>
                <input 
                  type="text" 
                  value={safeData.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
                    const rate = parseFloat(rawVal) || 0;
                    setExchangeRate(rate);
                    onUpdate({...safeData, exchangeRate: rate});
                  }}
                  className="w-full p-4 bg-orange-50 border border-orange-100 rounded-2xl text-xl font-black text-orange-700 outline-none focus:ring-2 ring-orange-500/20 font-mono-technical" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data do Pedido (1ª Parcela)</label>
                <input 
                  type="date" 
                  value={orderDate} 
                  onChange={(e) => {
                    setOrderDate(e.target.value);
                    onUpdate({...safeData, orderDate: e.target.value});
                  }} 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo de Produção (Dias)</label>
                <input 
                  type="number" 
                  value={productionDays} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setProductionDays(val);
                    onUpdate({...safeData, productionDays: val});
                  }} 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none" 
                />
              </div>
            </div>

            {safeData.exchangeRate > 0 && (
              <div className="p-4 bg-slate-900 rounded-2xl flex justify-between items-center text-white">
                <span className="text-[10px] font-black uppercase opacity-60">Total em Reais (Estimado)</span>
                <span className="text-lg font-black text-orange-400 font-mono-technical">R$ {(safeData.contractTotal * safeData.exchangeRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Termos de Pagamento (Ex: 30/70)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={paymentTermsInput} 
                  onChange={(e) => {
                    setPaymentTermsInput(e.target.value);
                    onUpdate({...safeData, paymentTerms: e.target.value});
                  }} 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-orange-500/20" 
                  placeholder="Ex: 30/70" 
                />
                <button onClick={applyPaymentTerms} className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all whitespace-nowrap shadow-xl">
                  Aplicar
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável (Ex: Eveline)</label>
              <input 
                type="text" 
                value={recipientName} 
                onChange={(e) => setRecipientName(e.target.value)} 
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-orange-500/20" 
                placeholder="Nome do contato" 
              />
            </div>
            <div className="space-y-3" data-zone="bank">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Bancários (Cole a Imagem Ctrl+V)</label>
              <div {...getBankRoot()} className="p-6 border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/20 hover:border-blue-500 hover:bg-blue-50/40 transition-all cursor-pointer text-center group">
                <input {...getBankInput()} />
                <Upload size={20} className="mx-auto text-blue-400 group-hover:text-blue-600 mb-2" />
                <p className="text-[10px] font-black text-blue-600 uppercase">Cole (Ctrl+V) ou Arraste a Imagem da Conta</p>
                <p className="text-[8px] font-bold text-blue-400 mt-1 uppercase">Clique aqui e cole o print para extrair</p>
              </div>
              <textarea 
                id="bank-details-area"
                value={bankDetails} 
                onChange={(e) => setBankDetails(e.target.value)} 
                className="w-full h-32 p-4 bg-white border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-blue-500/20 resize-none shadow-inner" 
                placeholder="Os dados extraídos da imagem aparecerão aqui..." 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-2xl flex flex-col">
                <span className="text-[9px] font-black text-blue-600 uppercase">Término Produção</span>
                <span className="text-sm font-black text-blue-800">
                  {(() => {
                    const d = new Date(orderDate + 'T12:00:00');
                    d.setDate(d.getDate() + productionDays);
                    return d.toLocaleDateString('pt-BR');
                  })()}
                </span>
              </div>
              <div className="p-4 bg-orange-50 rounded-2xl flex flex-col">
                <span className="text-[9px] font-black text-orange-600 uppercase">Previsão Embarque</span>
                <span className="text-sm font-black text-orange-800">
                  {(() => {
                    const d = new Date(orderDate + 'T12:00:00');
                    d.setDate(d.getDate() + productionDays + 10);
                    return d.toLocaleDateString('pt-BR');
                  })()}
                </span>
              </div>
            </div>

            {/* Quadro de Auditoria Estilo Modelo */}
            <div className="calculation-box space-y-4">
              <div className="flex justify-between items-center mb-4 border-b border-emerald-100 pb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Resumo de Auditoria</span>
                <span className="text-[10px] font-black text-emerald-600">v2.1 LATEST</span>
              </div>
              
              <div className="flex flex-col">
                  <span className="text-[9px] text-emerald-600/70 font-bold uppercase mb-1">Total do Contrato</span>
                  <div className="text-xl font-bold font-mono-technical">
                    {safeData.currency} {safeData.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
              </div>

              <div className="flex flex-col">
                  <span className="text-[9px] text-emerald-600/70 font-bold uppercase mb-1">Total Liquidado (Pago)</span>
                  <div className="text-lg font-mono-technical text-emerald-700">
                    - {safeData.currency} {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
              </div>

              <div className="pt-4 border-t border-emerald-200 mt-4">
                  <span className="text-[9px] text-rose-600 font-bold uppercase mb-1 block">Saldo a Pagar (Balance Due)</span>
                  <div className="text-2xl font-black text-rose-700 tracking-tighter font-mono-technical">
                    {safeData.currency} {balanceDue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8 bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h2 className="text-xs font-black uppercase text-slate-800">Detalhamento das Parcelas</h2>
            <button onClick={() => onUpdate({...safeData, milestones: [...safeData.milestones, { id: Math.random().toString(36).substr(2,9), description: "Nova Parcela", percentage: 0, amount: 0, isPaid: false, date: new Date().toISOString().split('T')[0] }]})} className="text-orange-600 text-[10px] font-black uppercase">+ Adicionar Parcela</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="p-5 text-[10px] font-black text-slate-400 uppercase">Data</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 uppercase">Descrição</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 uppercase text-right">Valor USD / %</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 uppercase text-center">Status</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 uppercase text-right"></th>
                </tr>
              </thead>
              <tbody>
                {safeData.milestones.map((m: any) => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/20 transition-all">
                    <td className="p-5">
                      <input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} className="bg-transparent text-xs font-bold text-slate-700 outline-none" />
                      <div className="text-[9px] text-slate-400 mt-1">{new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td className="p-5">
                      <input value={m.description} onChange={(e) => updateMilestone(m.id, { description: e.target.value })} className="bg-transparent text-xs font-medium text-slate-600 outline-none w-full" />
                    </td>
                    <td className="p-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-800 font-mono-technical">
                          {safeData.currency} {m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 font-mono-technical">
                          {m.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex justify-center">
                        <button onClick={() => updateMilestone(m.id, { isPaid: !m.isPaid })} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${m.isPaid ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                          {m.isPaid ? <CheckCircle size={14} /> : <Clock size={14} />}
                          {m.isPaid ? 'Pago' : 'A Pagar'}
                        </button>
                      </div>
                    </td>
                    <td className="p-5 text-right">
                      <button onClick={() => onUpdate({...safeData, milestones: safeData.milestones.filter((x: any) => x.id !== m.id)})} className="text-slate-200 hover:text-rose-500 transition-all"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {safeData.milestones.length === 0 && (
            <div className="p-20 text-center space-y-4">
              <Calendar size={40} className="mx-auto text-slate-100" />
              <p className="text-xs font-bold text-slate-400 uppercase">Nenhuma parcela registrada</p>
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[80vh]">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase">Meus Registros Salvos</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Carregue ou exclua pagamentos anteriores</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-all">×</button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-10">
                  <FolderOpen size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nenhum registro salvo ainda</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map(h => {
                    const paid = h.data.milestones?.filter((m:any)=>m.isPaid).reduce((s:number,m:any)=>s+(m.amount||0),0) || 0;
                    const total = h.data.contractTotal || 1;
                    const percent = ((paid/total)*100).toFixed(1);
                    const isSelected = selectedHistoryIds.includes(h.id);
                    return (
                      <div key={h.id} className={`p-5 border ${isSelected ? 'border-blue-500 bg-blue-50/10' : 'border-slate-100'} rounded-2xl flex items-center gap-4 hover:border-blue-200 transition-all group`}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => {
                            setSelectedHistoryIds(prev => isSelected ? prev.filter(id => id !== h.id) : [...prev, h.id]);
                          }}
                          className="w-5 h-5 rounded-lg border-slate-200 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="text-sm font-black text-slate-800 uppercase">{h.data.supplierName || "Fornecedor N/I"}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Ref: {h.data.ciNumber || h.id} • {new Date(h.dateSaved).toLocaleDateString('pt-BR')}</p>
                          <div className="mt-2 text-[10px] font-bold text-slate-500 uppercase flex gap-4">
                            <span>Total: USD {h.data.contractTotal?.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                            <span className="text-emerald-600">Pago: {percent}%</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => loadRecord(h.data)} className="px-4 py-2 bg-blue-50 text-blue-600 font-black uppercase text-[10px] rounded-xl hover:bg-blue-600 hover:text-white transition-all">Carregar</button>
                          <button onClick={() => deleteRecord(h.id)} className="px-4 py-2 bg-rose-50 text-rose-600 font-black uppercase text-[10px] rounded-xl hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
               <span className="text-[10px] font-black text-slate-400 uppercase">{selectedHistoryIds.length} selecionados</span>
               <div className="flex gap-2">
                 <button onClick={() => setSelectedHistoryIds([])} className="px-4 py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all">Limpar</button>
                 <button onClick={generateConsolidatedReport} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">Relatório Detalhado</button>
                 <button onClick={generateMonthlyFlowReport} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20">Baixar Fluxo Mensal</button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
