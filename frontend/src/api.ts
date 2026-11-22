import axios, { type AxiosError } from 'axios';

const API = axios.create({ baseURL: '/api' });

/** Extracts a user-friendly message from an axios error (backend returns { message }). */
export function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  const axiosErr = err as AxiosError<{ message?: string }>;
  if (axiosErr?.response?.data?.message) return axiosErr.response.data.message;
  if (axiosErr?.message === 'Network Error') return '无法连接到服务器，请检查后端是否运行';
  if (axiosErr?.message) return axiosErr.message;
  return fallback;
}

API.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    // Superseded requests (e.g. an older stock search) are aborted on purpose.
    if (!axios.isCancel(error)) console.error('API error:', error.config?.url, getErrorMessage(error));
    return Promise.reject(error);
  }
);

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
  industryPosition?: string;
  archived?: boolean;
  archivedAt?: string;
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
export const getStocks = (signal?: AbortSignal) => API.get<Stock[]>('/stocks', { signal });
export const createStock = (stock: Partial<Stock>) => API.post<Stock>('/stocks', stock);
export const updateStock = (id: number, stock: Partial<Stock>) => API.put<Stock>(`/stocks/${id}`, stock);
export const updateStockResearchValue = (id: number, researchValue: number) =>
  API.patch<Stock>(`/stocks/${id}/research-value`, { researchValue });
export const deleteStock = (id: number) => API.delete(`/stocks/${id}`);
export const setStockCategories = (id: number, categoryIds: number[]) =>
  API.put<Stock>(`/stocks/${id}/categories`, categoryIds);
export const getStockTimeline = (id: number, signal?: AbortSignal) =>
  API.get<StockTimelineEntry[]>(`/stocks/${id}/timeline`, { signal });
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
export const filterStocks = (categoryIds: number[], mode: 'union' | 'intersection', signal?: AbortSignal) =>
  API.get<Stock[]>('/stocks/filter', { params: { categoryIds: categoryIds.join(','), mode }, signal });
export const searchStocks = (keyword: string, signal?: AbortSignal) =>
  API.get<Stock[]>('/stocks/search', { params: { keyword }, signal });
export const getArchivedStocks = (signal?: AbortSignal) => API.get<Stock[]>('/stocks/archived', { signal });
export const archiveStock = (id: number) => API.patch<Stock>(`/stocks/${id}/archive`);
export const unarchiveStock = (id: number) => API.patch<Stock>(`/stocks/${id}/unarchive`);

// Category APIs
export const getCategories = (signal?: AbortSignal) => API.get<Category[]>('/categories', { signal });
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
  archived?: boolean;
}

export interface SectorReport {
  id: number;
  sectorId: number;
  sectorName: string;
  title: string;
  content: string;
  source?: string;
  reportDate?: string;
  category?: string;
  rating: number;
  archived?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const getSectors = () => API.get<Sector[]>('/research/sectors');
export const createSector = (payload: { name: string }) => API.post<Sector>('/research/sectors', payload);
export const updateSector = (id: number, payload: { name: string }) => API.put<Sector>(`/research/sectors/${id}`, payload);
export const deleteSector = (id: number) => API.delete(`/research/sectors/${id}`);
export const archiveSector = (id: number) => API.patch<Sector>(`/research/sectors/${id}/archive`);
export const unarchiveSector = (id: number) => API.patch<Sector>(`/research/sectors/${id}/unarchive`);

export const getSectorReports = (sectorId: number) =>
  API.get<SectorReport[]>(`/research/sectors/${sectorId}/reports`);
export const getAllSectorReports = () =>
  API.get<SectorReport[]>('/research/reports');
export const searchSectorReports = (keyword: string) =>
  API.get<SectorReport[]>('/research/reports/search', { params: { keyword } });
export const createSectorReport = (sectorId: number, payload: Pick<SectorReport, 'title' | 'content'> & { source?: string; reportDate?: string; category?: string }) =>
  API.post<SectorReport>(`/research/sectors/${sectorId}/reports`, payload);
export const updateSectorReport = (sectorId: number, reportId: number, payload: Pick<SectorReport, 'title' | 'content'> & { source?: string; reportDate?: string; category?: string; rating?: number; targetSectorId?: number }) =>
  API.put<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}`, payload);
export const moveSectorReport = (sectorId: number, reportId: number, targetSectorId: number) =>
  API.patch<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}/move`, { targetSectorId });
export const updateSectorReportRating = (sectorId: number, reportId: number, rating: number) =>
  API.patch<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}/rating`, { rating });
export const deleteSectorReport = (sectorId: number, reportId: number) =>
  API.delete(`/research/sectors/${sectorId}/reports/${reportId}`);
export const getArchivedSectorReports = () =>
  API.get<SectorReport[]>('/research/reports/archived');
export const archiveSectorReport = (sectorId: number, reportId: number) =>
  API.patch<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}/archive`);
export const unarchiveSectorReport = (sectorId: number, reportId: number) =>
  API.patch<SectorReport>(`/research/sectors/${sectorId}/reports/${reportId}/unarchive`);

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
export const getMarketEventsInRange = (from: string, to: string) =>
  API.get<MarketEvent[]>('/market-events/range', { params: { from, to } });
export const createMarketEvent = (event: Omit<MarketEvent, 'id' | 'createdAt' | 'updatedAt'>) =>
  API.post<MarketEvent>('/market-events', event);
export const updateMarketEvent = (id: number, event: Omit<MarketEvent, 'id' | 'createdAt' | 'updatedAt'>) =>
  API.put<MarketEvent>(`/market-events/${id}`, event);
export const deleteMarketEvent = (id: number) =>
  API.delete(`/market-events/${id}`);

// ===== Earnings Calendar (美股财报日历) APIs =====

export interface EarningsEntry {
  id: number;
  ticker: string;
  name: string;
  entryDate: string;   // "YYYY-MM-DD"
  reportTime: string;  // 盘前 | 盘后 | 未公布
  marketCap: string;   // "~210B"
  marketCapRaw: number;
  sp500: boolean;
  sector: string;
  epsForecast: string;
  epsActual: string;
  surprise: string;
  numEstimates: number;
  confirmed: boolean;
  reported: boolean;
}

export interface EarningsCalendarData {
  calendar: Record<string, EarningsEntry[]>;   // "YYYY-MM-DD" -> entries
  monthsFetched: Record<string, string>;        // "YYYY-MM" -> ISO timestamp
  watchlist: EarningsEntry[];
}

export const getEarningsCalendar = () =>
  API.get<EarningsCalendarData>('/earnings-calendar/calendar');
export const getEarningsNote = (ticker: string, date: string) =>
  API.get<{ content: string }>('/earnings-calendar/notes', { params: { ticker, date } });
export const saveEarningsNote = (ticker: string, date: string, content: string) =>
  API.post('/earnings-calendar/notes', { ticker, date, content });

/** SSE 拉取进度流的地址（通过 Vite 代理到后端）。 */
export const earningsRefreshStreamUrl = (year: number, month: number) =>
  `/api/earnings-calendar/refresh-stream?year=${year}&month=${month}`;

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

// ===== Ideas (赚钱Idea) APIs =====
export interface IdeaCategory {
  id: number;
  name: string;
  archived?: boolean;
}

export interface Idea {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  subCategory?: string;
  title: string;
  content: string;
  rating: number; // 0-5
  archived?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const getIdeaCategories = () => API.get<IdeaCategory[]>('/ideas/categories');
export const createIdeaCategory = (payload: { name: string }) => API.post<IdeaCategory>('/ideas/categories', payload);
export const updateIdeaCategory = (id: number, payload: { name: string }) => API.put<IdeaCategory>(`/ideas/categories/${id}`, payload);
export const deleteIdeaCategory = (id: number) => API.delete(`/ideas/categories/${id}`);
export const archiveIdeaCategory = (id: number) => API.patch<IdeaCategory>(`/ideas/categories/${id}/archive`);
export const unarchiveIdeaCategory = (id: number) => API.patch<IdeaCategory>(`/ideas/categories/${id}/unarchive`);

export const getIdeas = (params?: { categoryId?: number }) =>
  API.get<Idea[]>('/ideas', { params });
export const searchIdeas = (keyword: string) =>
  API.get<Idea[]>('/ideas/search', { params: { keyword } });
export const createIdea = (payload: { categoryId?: number | null; subCategory?: string; title: string; content?: string; rating?: number }) =>
  API.post<Idea>('/ideas', payload);
export const updateIdea = (id: number, payload: { categoryId?: number | null; subCategory?: string; title: string; content?: string; rating?: number }) =>
  API.put<Idea>(`/ideas/${id}`, payload);
export const updateIdeaRating = (id: number, rating: number) =>
  API.patch<Idea>(`/ideas/${id}/rating`, { rating });
export const deleteIdea = (id: number) => API.delete(`/ideas/${id}`);
export const getArchivedIdeas = () => API.get<Idea[]>('/ideas/archived');
export const archiveIdea = (id: number) => API.patch<Idea>(`/ideas/${id}/archive`);
export const unarchiveIdea = (id: number) => API.patch<Idea>(`/ideas/${id}/unarchive`);

// Idea Attachments
export interface IdeaAttachment {
  id: number;
  ideaId: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
}

export const getIdeaAttachments = (ideaId: number) =>
  API.get<IdeaAttachment[]>(`/ideas/${ideaId}/attachments`);
export const uploadIdeaAttachment = async (ideaId: number, file: File): Promise<IdeaAttachment> => {
  const form = new FormData();
  form.append('file', file);
  const res = await API.post<IdeaAttachment>(`/ideas/${ideaId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};
export const deleteIdeaAttachment = (ideaId: number, attachmentId: number) =>
  API.delete(`/ideas/${ideaId}/attachments/${attachmentId}`);
export const getIdeaAttachmentDownloadUrl = (ideaId: number, attachmentId: number) =>
  `/api/ideas/${ideaId}/attachments/${attachmentId}/download`;

// Idea Comments
export interface IdeaComment {
  id: number;
  ideaId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const getIdeaComments = (ideaId: number) =>
  API.get<IdeaComment[]>(`/ideas/${ideaId}/comments`);
export const createIdeaComment = (ideaId: number, content: string) =>
  API.post<IdeaComment>(`/ideas/${ideaId}/comments`, { content });
export const updateIdeaComment = (ideaId: number, commentId: number, content: string) =>
  API.put<IdeaComment>(`/ideas/${ideaId}/comments/${commentId}`, { content });
export const deleteIdeaComment = (ideaId: number, commentId: number) =>
  API.delete(`/ideas/${ideaId}/comments/${commentId}`);

// ===== Trades (交易记录) APIs =====
export interface TradeCategory {
  id: number;
  name: string;
}

export interface Trade {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  subCategory?: string;
  title: string;
  content: string;
  rating: number; // 0-5
  createdAt: string;
  updatedAt: string;
}

export const getTradeCategories = () => API.get<TradeCategory[]>('/trades/categories');
export const createTradeCategory = (payload: { name: string }) => API.post<TradeCategory>('/trades/categories', payload);
export const updateTradeCategory = (id: number, payload: { name: string }) => API.put<TradeCategory>(`/trades/categories/${id}`, payload);
export const deleteTradeCategory = (id: number) => API.delete(`/trades/categories/${id}`);

export const getTrades = (params?: { categoryId?: number }) =>
  API.get<Trade[]>('/trades', { params });
export const searchTrades = (keyword: string) =>
  API.get<Trade[]>('/trades/search', { params: { keyword } });
export const createTrade = (payload: { categoryId?: number | null; subCategory?: string; title: string; content?: string; rating?: number }) =>
  API.post<Trade>('/trades', payload);
export const updateTrade = (id: number, payload: { categoryId?: number | null; subCategory?: string; title: string; content?: string; rating?: number }) =>
  API.put<Trade>(`/trades/${id}`, payload);
export const updateTradeRating = (id: number, rating: number) =>
  API.patch<Trade>(`/trades/${id}/rating`, { rating });
export const deleteTrade = (id: number) => API.delete(`/trades/${id}`);

// ===== Valuation Comparison (估值比较) APIs =====
export interface ValuationSnapshot {
  id: number;
  ticker: string;
  companyName: string;
  snapshotDate: string; // "YYYY-MM-DD"
  pe?: number | null;
  ps?: number | null;
  ntmPe?: number | null;
  ntmPs?: number | null;
  grossMargin?: number | null;
  grossMarginQ1?: number | null;
  grossMarginQ2?: number | null;
  grossMarginQ3?: number | null;
  grossMarginQ4?: number | null;
  netMargin?: number | null;
  nonGaapNetMargin?: number | null;
  netMarginQ1?: number | null;
  netMarginQ2?: number | null;
  netMarginQ3?: number | null;
  netMarginQ4?: number | null;
  fcfMultiple?: number | null;
  fwdFcfMultiple?: number | null;
  ttmRoicY1?: number | null;
  ttmRoicY2?: number | null;
  ttmRoicY3?: number | null;
  ttmRoicY4?: number | null;
  notes?: string;
  createdAt: string;
}

export interface ValuationCompany {
  ticker: string;
  companyName: string;
}

export const getValuationSnapshots = (ticker?: string) =>
  API.get<ValuationSnapshot[]>('/valuations/snapshots', { params: ticker ? { ticker } : undefined });
export const getValuationCompanies = () =>
  API.get<ValuationCompany[]>('/valuations/companies');
export const createValuationSnapshot = (payload: Omit<ValuationSnapshot, 'id' | 'createdAt'>) =>
  API.post<ValuationSnapshot>('/valuations/snapshots', payload);
export const updateValuationSnapshot = (id: number, payload: Omit<ValuationSnapshot, 'id' | 'createdAt'>) =>
  API.put<ValuationSnapshot>(`/valuations/snapshots/${id}`, payload);
export const deleteValuationSnapshot = (id: number) =>
  API.delete(`/valuations/snapshots/${id}`);

// ===== Config APIs =====
export type KeySource = 'DATABASE' | 'ENVIRONMENT' | 'NONE';

export interface AppConfig {
  twelvedataApiKeyConfigured: boolean;
  twelvedataApiKeyMasked: string;
  /** DATABASE = saved from the UI, ENVIRONMENT = from .env / env vars, NONE = not configured */
  twelvedataApiKeySource: KeySource;
  fredApiKeyConfigured: boolean;
  fredApiKeyMasked: string;
  fredApiKeySource: KeySource;
}
export const getConfig = () => API.get<AppConfig>('/config');
/** A key that is omitted stays untouched; an empty string clears the key saved from the UI. */
export const saveConfig = (config: { twelvedataApiKey?: string; fredApiKey?: string }) =>
  API.put<{ status: string }>('/config', config);

// ===== Liquidity Monitor (美元流动性监测) APIs =====
export type LiquidityStatus = 'GREEN' | 'YELLOW' | 'RED' | 'NONE';
export type ThresholdDirection = 'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE';
export type SyncMode = 'INCREMENTAL' | 'FULL';
export type SeriesKind = 'RAW' | 'DERIVED' | 'MANUAL';
export type SeriesGroup =
  'RATE' | 'SPREAD' | 'STOCK' | 'FACILITY' | 'CREDIT' | 'MANUAL' | 'PRESSURE' | 'POLICY' | 'BALANCE_SHEET';

export interface LiquidityCatalogEntry {
  code: string;
  name: string;
  unit: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'EVENT';
  source: 'NYFED' | 'TREASURY' | 'FRED' | 'FEDTEXT' | 'MANUAL' | null;
  kind: SeriesKind;
  group: SeriesGroup;
  description: string | null;
}

export interface LiquidityPoint {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface LiquidityCard {
  code: string;
  name: string;
  unit: string;
  row: number;
  latest: LiquidityPoint | null;
  prevWeek: LiquidityPoint | null;
  change: number | null;
  status: LiquidityStatus;
  spark: LiquidityPoint[];
  needsFredKey: boolean;
}

export interface LiquiditySourceStatus {
  source: 'NYFED' | 'TREASURY' | 'FRED' | 'FEDTEXT';
  lastSuccessAt: string | null;
  lastStatus: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | null;
  latestObsDate: string | null;
}

export interface LiquidityDashboard {
  asOf: string | null;
  overallStatus: LiquidityStatus;
  cards: LiquidityCard[];
  sources: LiquiditySourceStatus[];
  fredConfigured: boolean;
  syncRunning: boolean;
  observationCount: number;
}

/** code -> [["YYYY-MM-DD", value], ...] */
export type LiquiditySeriesData = Record<string, [string, number][]>;

export interface LiquidityScatterPoint {
  weekEnd: string;
  ratio: number;
  tgcrIorb: number;
  era: 'EARLY' | 'MID' | 'RECENT';
}

export interface LiquidityWeeklyRow {
  key: string;
  label: string;
  unit: string;
  basis: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  status: LiquidityStatus;
  dataDate: string | null;
  note: string | null;
}

export interface LiquidityWeeklyReport {
  weekStart: string;
  weekEnd: string;
  dataAsOf: string | null;
  overallStatus: LiquidityStatus;
  rows: LiquidityWeeklyRow[];
  observations: string[];
}

export interface LiquiditySnapshotSummary {
  id: number;
  weekEnd: string;
  hasCommentary: boolean;
  updatedAt: string;
}

export interface LiquiditySnapshotDetail {
  id: number;
  weekEnd: string;
  report: LiquidityWeeklyReport;
  commentary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiquidityFetchLog {
  id: number;
  source: string;
  mode: SyncMode;
  rangeFrom: string | null;
  rangeTo: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  rowsUpserted: number;
  message: string | null;
}

export interface LiquiditySyncProgress {
  source: string;
  sourceIndex: number;
  sourceCount: number;
  step: number;
  steps: number;
  label: string | null;
  startedAt: string;
}

export interface LiquiditySyncStatus {
  running: boolean;
  current: LiquiditySyncProgress | null;
  lastLogs: LiquidityFetchLog[];
}

export interface LiquidityThresholdRule {
  code: string;
  direction: ThresholdDirection;
  yellow: number;
  red: number;
  enabled: boolean;
}

export interface LiquidityThresholdView {
  code: string;
  name: string;
  unit: string;
  rule: LiquidityThresholdRule;
  customized: boolean;
  defaults: LiquidityThresholdRule | null;
}

export interface LiquidityManualSeries {
  code: string;
  name: string;
  unit: string;
  description: string | null;
  createdAt: string;
}

export const getLiquidityCatalog = () => API.get<LiquidityCatalogEntry[]>('/liquidity/catalog');
export const getLiquidityDashboard = () => API.get<LiquidityDashboard>('/liquidity/dashboard');
export const getLiquiditySeries = (codes: string[], from?: string, to?: string) =>
  API.get<LiquiditySeriesData>('/liquidity/series', { params: { codes: codes.join(','), from, to } });
export const getLiquidityScatter = (from?: string) =>
  API.get<LiquidityScatterPoint[]>('/liquidity/scatter', { params: { from } });

export const getLiquidityWeekly = (weekEnd?: string) =>
  API.get<LiquidityWeeklyReport>('/liquidity/weekly', { params: { weekEnd } });
export const getLiquiditySnapshots = () => API.get<LiquiditySnapshotSummary[]>('/liquidity/weekly/snapshots');
export const getLiquiditySnapshot = (id: number) => API.get<LiquiditySnapshotDetail>(`/liquidity/weekly/snapshots/${id}`);
export const saveLiquiditySnapshot = (weekEnd: string, commentary: string) =>
  API.post<LiquiditySnapshotDetail>('/liquidity/weekly/snapshots', { weekEnd, commentary });
export const updateLiquiditySnapshot = (id: number, commentary: string) =>
  API.put<LiquiditySnapshotDetail>(`/liquidity/weekly/snapshots/${id}`, { commentary });
export const deleteLiquiditySnapshot = (id: number) => API.delete(`/liquidity/weekly/snapshots/${id}`);

export type SyncSource = LiquiditySourceStatus['source'];
export const SYNC_SOURCES: SyncSource[] = ['NYFED', 'TREASURY', 'FRED', 'FEDTEXT'];
export const startLiquiditySync = (mode: SyncMode, source?: SyncSource) =>
  API.post<{ status: string; mode: SyncMode }>('/liquidity/sync', null, { params: { mode, source } });
export const getLiquiditySyncStatus = () => API.get<LiquiditySyncStatus>('/liquidity/sync/status');

export const getLiquidityThresholds = () => API.get<LiquidityThresholdView[]>('/liquidity/thresholds');
export const saveLiquidityThreshold = (code: string, rule: Omit<LiquidityThresholdRule, 'code'>) =>
  API.put<LiquidityThresholdRule>(`/liquidity/thresholds/${code}`, rule);
export const resetLiquidityThreshold = (code: string) => API.delete(`/liquidity/thresholds/${code}`);

export const getLiquidityManualSeries = () => API.get<LiquidityManualSeries[]>('/liquidity/manual-series');
export const createLiquidityManualSeries = (payload: { code: string; name: string; unit: string; description?: string }) =>
  API.post<LiquidityManualSeries>('/liquidity/manual-series', payload);
export const deleteLiquidityManualSeries = (code: string) => API.delete(`/liquidity/manual-series/${code}`);
export const saveLiquidityObservations = (code: string, points: LiquidityPoint[]) =>
  API.post<{ saved: number }>(`/liquidity/manual-series/${code}/observations`, points);
export const deleteLiquidityObservation = (code: string, date: string) =>
  API.delete(`/liquidity/manual-series/${code}/observations/${date}`);

// ----- QE Radar (放水雷达) -----
export type QeLikelihoodLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type FedTextDocType = 'STATEMENT' | 'IMPL_NOTE' | 'MINUTES' | 'OTHER';
export type QeAlertType = 'STAGE_CHANGE' | 'LIKELIHOOD_CHANGE' | 'TEXT_HIT';

export interface QeStage {
  level: number; // 0..4
  name: string;
  triggers: string[];
  since: string | null;
  /** The Fed has announced L3/L4 but the data has not confirmed it yet. */
  announced: { level: 3 | 4; docDate: string; title: string } | null;
}

export interface FedTextSummary {
  id: number;
  docDate: string;
  title: string;
  url: string;
  docType: FedTextDocType;
  categories: string[];
  stance: number;
  hasDirectiveChanges: boolean;
}

export interface FedTextDetail extends FedTextSummary {
  body: string;
  hits: { category: string; sentence: string }[];
  directive: string | null;
  directiveChanges: { added: string[]; removed: string[] } | null;
}

export interface QeRadarView {
  asOf: string | null;
  stage: QeStage;
  likelihood: { level: QeLikelihoodLevel; reasons: string[] };
  nextSteps: string[];
  layers: { pressure: LiquidityCard[]; intent: LiquidityCard[]; action: LiquidityCard[] };
  latestTexts: FedTextSummary[];
  unreadAlerts: number;
  fredConfigured: boolean;
}

export interface QeStageSegment {
  from: string;
  to: string;
  level: number;
  triggers: string[];
}

export interface QeEpisode {
  id: string;
  name: string;
  keyDates: string[];
  /** Display text such as "QE" or "L3 → L2". */
  type: string;
  summary: string;
}

export interface QeReplayLead {
  code: string;
  name: string;
  firstYellow: string | null;
  firstRed: string | null;
  leadDaysYellow: number | null;
  leadDaysRed: number | null;
}

export interface QeReplay {
  episode: QeEpisode;
  from: string;
  to: string;
  stages: { from: string; to: string; level: number }[];
  series: LiquiditySeriesData;
  leads: QeReplayLead[];
  texts: { id: number; docDate: string; title: string; categories: string[] }[];
}

export interface QeAlert {
  id: number;
  alertType: QeAlertType;
  title: string;
  detail: string | null;
  refDate: string | null;
  acknowledged: boolean;
  createdAt: string;
}

const QE_RADAR = '/liquidity/qe-radar';
export const getQeRadar = () => API.get<QeRadarView>(QE_RADAR);
export const getQeStageHistory = (from?: string) =>
  API.get<QeStageSegment[]>(`${QE_RADAR}/stage-history`, { params: { from } });
export const getQeTexts = (limit = 50) => API.get<FedTextSummary[]>(`${QE_RADAR}/texts`, { params: { limit } });
export const getQeText = (id: number) => API.get<FedTextDetail>(`${QE_RADAR}/texts/${id}`);
export const getQeEpisodes = () => API.get<QeEpisode[]>(`${QE_RADAR}/episodes`);
export const getQeReplay = (episodeId: string) => API.get<QeReplay>(`${QE_RADAR}/replay/${episodeId}`);
export const getQeAlerts = (unreadOnly = false, limit = 50) =>
  API.get<QeAlert[]>(`${QE_RADAR}/alerts`, { params: { unreadOnly, limit } });
export const getQeUnreadCount = () => API.get<{ count: number }>(`${QE_RADAR}/alerts/unread-count`);
export const ackQeAlert = (id: number) => API.post(`${QE_RADAR}/alerts/${id}/ack`);
export const ackAllQeAlerts = () => API.post(`${QE_RADAR}/alerts/ack-all`);

// ===== Market Valuation (美股估值监测) APIs =====
export type MvWindow = '10Y' | '20Y' | 'SINCE_1990' | 'ALL';
export type MvDirection = 'HIGHER_IS_EXPENSIVE' | 'LOWER_IS_EXPENSIVE' | 'NONE';
export type MvGroup =
  'VALUATION' | 'RELATIVE' | 'PROFITABILITY' | 'STRUCTURE' | 'PRICE' | 'MACRO' | 'FACTSET' | 'MARKETS' | 'MANUAL';
export type MvSyncSource = 'YAHOO' | 'MULTPL' | 'WPR' | 'FACTSET' | 'FRED';
export type MvMissing = 'NO_FRED_KEY' | 'NO_DATA' | null;

export interface MvCatalogEntry {
  code: string;
  name: string;
  unit: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'EVENT';
  source: string | null;
  kind: SeriesKind;
  group: MvGroup;
  direction: MvDirection;
  typicalLagDays: number;
  estimate: boolean;
  description: string | null;
}

export interface MvPrev {
  date: string;
  value: number;
}

export interface MvTemperatureComponent {
  key: 'CAPE' | 'BUFFETT' | 'PS' | 'FWD_PE' | 'ERP';
  name: string;
  code: string;
  value: number | null;
  date: string | null;
  /** "More expensive = higher" for every component (the ERP one is already inverted). */
  percentile: number | null;
  sampleStart: string | null;
  n: number;
  excluded: boolean;
  excludedReason: string | null;
}

export interface MvTemperature {
  value: number | null;
  level: string | null;
  components: MvTemperatureComponent[];
}

export interface MvCard {
  code: string;
  name: string;
  unit: string;
  group: 'ABSOLUTE' | 'RELATIVE' | 'STRUCTURE';
  direction: MvDirection;
  value: number | null;
  date: string | null;
  prev: MvPrev | null;
  change: number | null;
  /** Already direction-adjusted (100 − p for LOWER_IS_EXPENSIVE). */
  percentile: number | null;
  spark: [string, number][];
  stale: boolean;
  estimate: boolean;
  missing: MvMissing;
}

export interface MvProfitItem {
  code: string;
  name: string;
  unit: string;
  value: number | null;
  date: string | null;
  quarter: string | null;
  prev: MvPrev | null;
  change: number | null;
  stale: boolean;
  missing: MvMissing;
}

export interface MvProfitability {
  epsYoy: MvProfitItem;
  netMargin: MvProfitItem;
  roe: MvProfitItem;
  profitGdp: MvProfitItem;
  fsEpsGrowthQ: MvProfitItem;
  fsFwdEpsChg13w: MvProfitItem;
  fsEpsGrowthNextYear: MvProfitItem;
}

export interface MvQuadrant {
  valuation: string;
  earnings: '强' | '温和' | '下滑' | null;
  text: string;
}

export interface MvSourceStatus {
  source: string;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  latestObsDate: string | null;
}

export interface MvDashboard {
  asOf: string | null;
  window: MvWindow;
  temperature: MvTemperature;
  cards: MvCard[];
  profitability: MvProfitability;
  quadrant: MvQuadrant | null;
  sources: MvSourceStatus[];
  fredConfigured: boolean;
  syncRunning: boolean;
  /** False while the observation table is still empty (initial backfill). */
  hasData: boolean;
}

/** code -> [["YYYY-MM-DD", value], ...] */
export type MvSeriesData = Record<string, [string, number][]>;

export interface MvStats {
  n: number;
  sampleStart: string | null;
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MvSeriesResponse {
  series: MvSeriesData;
  /** Only present when a window was requested. */
  stats?: Record<string, MvStats | null>;
}

export type MvMarketWindowKey = '1Y' | '5Y' | '10Y' | '20Y';
export type MvZLabel = '昂贵' | '高估' | '合理' | '低估' | '便宜';

export interface MvMarketWindow {
  avg: number | null;
  sd: number | null;
  z: number | null;
  label: MvZLabel | null;
}

export interface MvMarketRow {
  market: 'SPX' | 'NDX' | 'DJI' | 'RUT' | 'CN' | 'HK' | 'JP';
  name: string;
  scopeNote: string | null;
  date: string | null;
  pe: number | null;
  windows: Partial<Record<MvMarketWindowKey, MvMarketWindow>>;
  history: [string, number][];
}

export interface MvDecompositionPart {
  total: number;
  valuation: number;
  earnings: number;
}

export interface MvDecompositionRow {
  horizon: '1Y' | '3Y' | '5Y' | '10Y';
  startDate: string;
  endDate: string;
  ttm: MvDecompositionPart | null;
  cape: MvDecompositionPart | null;
  forward: MvDecompositionPart | null;
}

export interface MvScatterPoint {
  date: string;
  roe: number;
  pb: number;
  era: '2000-2008' | '2009-2019' | '2020+' | 'LATEST';
}

export interface MvSyncProgress {
  source: string;
  sourceIndex: number;
  sourceCount: number;
  step: number;
  steps: number;
  label: string | null;
  startedAt: string;
}

export interface MvFetchLog {
  id: number;
  source: string;
  mode: SyncMode;
  rangeFrom: string | null;
  rangeTo: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  rowsUpserted: number;
  message: string | null;
}

export interface MvSyncStatus {
  running: boolean;
  current: MvSyncProgress | null;
  lastLogs: MvFetchLog[];
}

export interface MvFactsetReport {
  weekFriday: string;
  reportDate: string | null;
  fileName: string | null;
  status: 'PARSED' | 'PARSE_FAILED' | 'NOT_FOUND';
  fiscalQuarter: string | null;
  message: string | null;
  fetchedAt: string;
}

export interface MvFactsetReports {
  reports: MvFactsetReport[];
  processedWeeks: number;
  totalWeeks: number;
}

export interface MvManualSeries {
  code: string;
  name: string;
  unit: string;
  description: string | null;
  createdAt: string;
}

const MV = '/market-valuation';
export const MV_SYNC_SOURCES: MvSyncSource[] = ['YAHOO', 'MULTPL', 'WPR', 'FACTSET', 'FRED'];

export const getMvCatalog = () => API.get<MvCatalogEntry[]>(`${MV}/catalog`);
export const getMvDashboard = (window: MvWindow) => API.get<MvDashboard>(`${MV}/dashboard`, { params: { window } });
export const getMvSeries = (codes: string[], from?: string, to?: string, window?: MvWindow) =>
  API.get<MvSeriesResponse>(`${MV}/series`, { params: { codes: codes.join(','), from, to, window } });
export const getMvMarkets = () => API.get<MvMarketRow[]>(`${MV}/markets`);
export const getMvDecomposition = () => API.get<MvDecompositionRow[]>(`${MV}/decomposition`);
export const getMvPbRoeScatter = () => API.get<MvScatterPoint[]>(`${MV}/scatter/pb-roe`);

export const startMvSync = (mode: SyncMode, source?: MvSyncSource) =>
  API.post<{ status: string; mode: SyncMode }>(`${MV}/sync`, null, { params: { mode, source } });
export const refreshMvIfStale = () =>
  API.post<{ triggered: boolean; lastSuccessAt: string | null }>(`${MV}/refresh-if-stale`);
export const getMvSyncStatus = () => API.get<MvSyncStatus>(`${MV}/sync/status`);
export const getMvFactsetReports = (limit = 30) => API.get<MvFactsetReports>(`${MV}/factset/reports`, { params: { limit } });
export const retryMvFactsetReport = (weekFriday: string) =>
  API.post<{ status: string }>(`${MV}/factset/reports/${weekFriday}/retry`);

export const getMvManualSeries = () => API.get<MvManualSeries[]>(`${MV}/manual-series`);
export const createMvManualSeries = (payload: { code: string; name: string; unit: string; description?: string }) =>
  API.post<MvManualSeries>(`${MV}/manual-series`, payload);
export const deleteMvManualSeries = (code: string) => API.delete(`${MV}/manual-series/${code}`);
export const saveMvObservations = (code: string, points: { date: string; value: number }[]) =>
  API.post<{ saved: number }>(`${MV}/manual-series/${code}/observations`, points);
export const deleteMvObservation = (code: string, date: string) =>
  API.delete(`${MV}/manual-series/${code}/observations/${date}`);


