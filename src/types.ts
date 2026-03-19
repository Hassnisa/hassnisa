export interface Certificate {
  ccrNo: string;
  approvalDate: string;
  expiryDate: string;
  issueDate?: string;
  terms?: string;
  type: string;
  pageNumber: number;
  status?: 'valid' | 'expired' | 'not_found';
}

export interface InvoiceItem {
  specification: string;
  quantity: number;
  date: string;
}

export interface AnalysisResult {
  certificates: Certificate[];
  invoices: InvoiceItem[];
}
