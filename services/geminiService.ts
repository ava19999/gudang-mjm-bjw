// Mock service for static UI version - replaces geminiService.ts

export interface ResiAnalysisResult {
  date?: string;
  resi?: string;
  ecommerce?: string;
  customerName?: string;
  items?: {
    sku?: string;
    name?: string;
    qty?: number;
    price?: number;
    total?: number;
  }[];
}

export interface AIAnalysisResult {
  name?: string;
  description?: string;
  shelf?: string;
}

export const analyzeInventoryImage = async (base64Data: string): Promise<AIAnalysisResult> => {
  console.log('Mock: analyzeInventoryImage called');
  return Promise.resolve({
    name: 'Sample Item',
    description: 'Sample description',
    shelf: 'RAK A01'
  });
};

export const analyzeResiImage = async (base64Data: string): Promise<ResiAnalysisResult> => {
  console.log('Mock: analyzeResiImage called');
  return Promise.resolve({
    date: new Date().toISOString(),
    resi: 'RESI-SAMPLE-001',
    ecommerce: 'Sample',
    customerName: 'Sample Customer',
    items: []
  });
};
