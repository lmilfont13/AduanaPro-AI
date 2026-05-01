export interface DocumentData {
  documentType: "BL" | "CI" | "PL" | "UNKNOWN";
  blNumber: string;
  weight: number;
  cbm: number;
  packages: number; // Quantidade de Caixas (Volumes)
  itemQuantity: number; // Quantidade de Itens/Peças
  description: string;
  consignee: string;
  shipper: string;
  origin: string;
  destination: string;
}

export interface ComparisonResult {
  matches: boolean;
  differences: {
    field: string;
    status: "match" | "mismatch";
    message: string;
    correction: string;
  }[];
}

export interface FreightItem {
  name: string;
  value: number;
  currency: "USD" | "BRL" | "EUR";
  type: "PREPAID" | "COLLECT";
}

export interface FreightData {
  documentType: "QUOTE" | "INVOICE";
  oceanFreight?: FreightItem;
  items: FreightItem[];
  vessel?: string;
  blNumber?: string;
  totalUSD: number; // Total convertido para USD
  totalBRL: number; // Total convertido para BRL
  originalUSD: number; // Soma apenas dos itens em USD
  originalBRL: number; // Soma apenas dos itens em BRL
  exchangeRate?: number;
  transitTime?: string;
  freeTime?: string;
  validity?: string;
  agentName?: string;
}

export interface FreightComparison {
  matches: boolean;
  differences: {
    itemName: string;
    quoteValue: number;
    invoiceValue: number;
    currency: string;
    diff: number;
    status: "match" | "mismatch";
    severity: "low" | "high";
    message?: string;
  }[];
}
export interface PaymentMilestone {
  id: string;
  date: string;
  percentage: number;
  amount: number;
  exchangeRate?: number;
  amountBRL?: number;
  description: string;
  isPaid: boolean;
  reference?: string;
}

export interface SupplierPaymentData {
  supplierName: string;
  orderNumber: string;
  contractTotal: number;
  currency: "USD" | "BRL" | "EUR";
  paymentTerms?: string;
  milestones: PaymentMilestone[];
  notes?: string;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    swiftCode?: string;
    beneficiaryName?: string;
  };
}
