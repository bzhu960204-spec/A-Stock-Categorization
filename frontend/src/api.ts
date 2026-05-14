import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export interface Category {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface Stock {
  id: number;
  code: string;
  name: string;
  notes: string;
  market?: 'CN' | 'US' | string;
  researchValue?: number;
  recommender?: string;
  business?: string;
  customers?: string;
  competitors?: string;
  strengths?: string;
  structuralWeaknesses?: string;
  future?: string;
  strengthsWeaknessesLegacy?: string;
  founderCeoHolding?: string;
  categories: Category[];
}

export interface LookupResult {
  code: string;
  name: string;
  error?: string;
}

export interface LookupSuggestion {
  code: string;
  name: string;
  exchange?: string;
}

export interface StockTimelineEntry {
  id: number;
  stockId: number;
  stockCode: string;
  stockName: string;
  actionType: 'CREATE' | 'UPDATE' | 'CATEGORY' | 'DELETE' | 'DOCUMENT' | string;
  description: string;
  createdAt: string;
}

export interface StockDocument {
  id: number;
  stockId: number;
  stockCode: string;
  stockName: string;
  title: string;
  category?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// Stock APIs
export const getStocks = () => API.get<Stock[]>('/stocks');
export const createStock = (stock: Partial<Stock>) => API.post<Stock>('/stocks', stock);
export const updateStock = (id: number, stock: Partial<Stock>) => API.put<Stock>(`/stocks/${id}`, stock);
export const updateStockResearchValue = (id: number, researchValue: number) =>
  API.patch<Stock>(`/stocks/${id}/research-value`, { researchValue });
export const deleteStock = (id: number) => API.delete(`/stocks/${id}`);
export const setStockCategories = (id: number, categoryIds: number[]) =>
  API.put<Stock>(`/stocks/${id}/categories`, categoryIds);
export const getStockTimeline = (id: number) =>
  API.get<StockTimelineEntry[]>(`/stocks/${id}/timeline`);
export const getStockDocuments = (id: number) =>
  API.get<StockDocument[]>(`/stocks/${id}/documents`);
export const createStockDocument = (id: number, payload: Pick<StockDocument, 'title' | 'content' | 'category'>) =>
  API.post<StockDocument>(`/stocks/${id}/documents`, payload);
export const updateStockDocument = (stockId: number, docId: number, payload: Pick<StockDocument, 'title' | 'content' | 'category'>) =>
  API.put<StockDocument>(`/stocks/${stockId}/documents/${docId}`, payload);
export const deleteStockDocument = (stockId: number, docId: number) =>
  API.delete(`/stocks/${stockId}/documents/${docId}`);
export const uploadDocImage = async (file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const res = await API.post<{ id: number; url: string }>('/images', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.url;
};
export const filterStocks = (categoryIds: number[], mode: 'union' | 'intersection') =>
  API.get<Stock[]>('/stocks/filter', { params: { categoryIds: categoryIds.join(','), mode } });
export const searchStocks = (keyword: string) => API.get<Stock[]>('/stocks/search', { params: { keyword } });

// Category APIs
export const getCategories = () => API.get<Category[]>('/categories');
export const createCategory = (category: Partial<Category>) => API.post<Category>('/categories', category);
export const updateCategory = (id: number, category: Partial<Category>) => API.put<Category>(`/categories/${id}`, category);
export const deleteCategory = (id: number) => API.delete(`/categories/${id}`);

// Lookup API
export const lookupStock = (keyword: string) => API.get<LookupResult>('/lookup', { params: { keyword } });
export const lookupStockSuggest = (keyword: string, limit = 8) =>
  API.get<LookupSuggestion[]>('/lookup/suggest', { params: { keyword, limit } });
export const lookupUsStock = (keyword: string) => API.get<LookupResult>('/lookup/us', { params: { keyword } });
export const lookupUsStockSuggest = (keyword: string, limit = 8) =>
  API.get<LookupSuggestion[]>('/lookup/us/suggest', { params: { keyword, limit } });
export const lookupGlobalStockSuggest = (keyword: string, market: string, limit = 8) =>
  API.get<Array<LookupSuggestion & { exchange?: string }>>('/lookup/global/suggest', { params: { keyword, market, limit } });
export const lookupGlobalStock = (keyword: string, market: string) =>
  API.get<LookupResult & { exchange?: string }>('/lookup/global', { params: { keyword, market } });

// ===== Research (行业研报) APIs =====

export interface Sector {
  id: number;
  name: string;
}

export interface SectorReport {
  id: number;
  sectorId: number;
  sectorName: string;
  title: string;
  content: string;
  source?: string;
  reportDate?: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export const getSectors = () => API.get<Sector[]>('/research/sectors');
export const createSector = (payload: { name: string }) => API.post<Sector>('/research/sectors', payload);
export const updateSector = (id: number, payload: { name: string }) => API.put<Sector>(`/research/sectors/${id}`, payload);
export const deleteSector = (id: number) => API.delete(`/research/sectors/${id}`);

export const getSectorReports = (sectorId: number) =>
  API.get<SectorReport[]>(`/research/sectors/${sectorId}/reports`);
export const searchSectorReports = (keyword: string) =>
  API.get<SectorReport[]>('/research/reports/search', { params: { keyword } });
export const createSectorReport = (sectorId: number, payload: Pick<SectorReport, 'title' | 'content'> & { source?: string; reportDate?: string }) =>
  API.post<SectorReport>(`/research/sectors/${sectorId}/reports`, payload);
export const updateSectorReport = (sectorId: number, reportId: number, payload: Pick<SectorReport, 'title' | 'content'> & { source?: string; reportDate?: string; rating?: number }) =>
  API.put<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}`, payload);
export const updateSectorReportRating = (sectorId: number, reportId: number, rating: number) =>
  API.patch<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}/rating`, { rating });
export const deleteSectorReport = (sectorId: number, reportId: number) =>
  API.delete(`/research/sectors/${sectorId}/reports/${reportId}`);

// ===== Earnings Reports (财报分析) APIs =====
export interface EarningsReport {
  id: number;
  stockId: number;
  stockCode: string;
  stockName: string;
  title: string;
  fiscalPeriod?: string;
  result?: 'BEAT' | 'MISS' | 'IN_LINE';
  reportDate?: string; // ISO date "YYYY-MM-DD"
  content?: string;
  createdAt: string;
  updatedAt: string;
}

export const getEarningsReports = (stockId: number) =>
  API.get<EarningsReport[]>(`/stocks/${stockId}/earnings`);
export const createEarningsReport = (stockId: number, payload: Omit<EarningsReport, 'id' | 'stockId' | 'stockCode' | 'stockName' | 'createdAt' | 'updatedAt'>) =>
  API.post<EarningsReport>(`/stocks/${stockId}/earnings`, payload);
export const updateEarningsReport = (stockId: number, reportId: number, payload: Omit<EarningsReport, 'id' | 'stockId' | 'stockCode' | 'stockName' | 'createdAt' | 'updatedAt'>) =>
  API.put<EarningsReport>(`/stocks/${stockId}/earnings/${reportId}`, payload);
export const deleteEarningsReport = (stockId: number, reportId: number) =>
  API.delete(`/stocks/${stockId}/earnings/${reportId}`);

// ===== Industry Chain (产业链) APIs =====
export interface IndustryChain {
  id: number;
  stockId: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const getIndustryChains = (stockId: number) =>
  API.get<IndustryChain[]>(`/stocks/${stockId}/industry-chains`);
export const createIndustryChain = (stockId: number, payload: Pick<IndustryChain, 'title' | 'content'>) =>
  API.post<IndustryChain>(`/stocks/${stockId}/industry-chains`, payload);
export const updateIndustryChain = (stockId: number, chainId: number, payload: Pick<IndustryChain, 'title' | 'content'>) =>
  API.put<IndustryChain>(`/stocks/${stockId}/industry-chains/${chainId}`, payload);
export const deleteIndustryChain = (stockId: number, chainId: number) =>
  API.delete(`/stocks/${stockId}/industry-chains/${chainId}`);

// ===== Market Calendar (市场日历) APIs =====
export interface MarketEvent {
  id: number;
  title: string;
  eventDate: string; // ISO date string "YYYY-MM-DD"
  description?: string;
  category?: string;  // 政策 | 财报 | 经济数据 | 央行 | 其他
  importance?: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt?: string;
  updatedAt?: string;
}

export const getMarketEvents = (year: number, month: number) =>
  API.get<MarketEvent[]>('/market-events', { params: { year, month } });
export const createMarketEvent = (event: Omit<MarketEvent, 'id' | 'createdAt' | 'updatedAt'>) =>
  API.post<MarketEvent>('/market-events', event);
export const updateMarketEvent = (id: number, event: Omit<MarketEvent, 'id' | 'createdAt' | 'updatedAt'>) =>
  API.put<MarketEvent>(`/market-events/${id}`, event);
export const deleteMarketEvent = (id: number) =>
  API.delete(`/market-events/${id}`);

// ===== Tech Cycle (技术周期) APIs =====
export interface TechCycle {
  id: number;
  name: string;
  description?: string;
  color?: string;
  createdAt?: string;
}

export interface TechCyclePhase {
  id: number;
  techCycleId: number;
  title: string;
  phaseType?: 'BUDDING' | 'GROWTH' | 'BOOM' | 'MATURE' | 'DECLINE' | 'CUSTOM';
  startYear: number;
  startQuarter?: number;
  endYear: number;
  endQuarter?: number;
  notes?: string;
  sortOrder?: number;
}

export const getTechCycles = () => API.get<TechCycle[]>('/tech-cycles');
export const createTechCycle = (c: Omit<TechCycle, 'id' | 'createdAt'>) => API.post<TechCycle>('/tech-cycles', c);
export const updateTechCycle = (id: number, c: Omit<TechCycle, 'id' | 'createdAt'>) => API.put<TechCycle>(`/tech-cycles/${id}`, c);
export const deleteTechCycle = (id: number) => API.delete(`/tech-cycles/${id}`);

export const getTechCyclePhases = (cycleId: number) => API.get<TechCyclePhase[]>(`/tech-cycles/${cycleId}/phases`);
export const createTechCyclePhase = (cycleId: number, p: Omit<TechCyclePhase, 'id' | 'techCycleId'>) =>
  API.post<TechCyclePhase>(`/tech-cycles/${cycleId}/phases`, p);
export const updateTechCyclePhase = (cycleId: number, phaseId: number, p: Omit<TechCyclePhase, 'id' | 'techCycleId'>) =>
  API.put<TechCyclePhase>(`/tech-cycles/${cycleId}/phases/${phaseId}`, p);
export const deleteTechCyclePhase = (cycleId: number, phaseId: number) =>
  API.delete(`/tech-cycles/${cycleId}/phases/${phaseId}`);

// ===== Config APIs =====
export interface AppConfig {
  twelvedataApiKey: string;
  twelvedataApiKeyMasked: string;
}
export const getConfig = () => API.get<AppConfig>('/config');
export const saveConfig = (config: { twelvedataApiKey: string }) => API.put<{ status: string; twelvedataApiKey: string }>('/config', config);
