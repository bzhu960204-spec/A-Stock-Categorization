import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface Stock {
  id: number;
  code: string;
  name: string;
  notes: string;
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
}

// Stock APIs
export const getStocks = () => API.get<Stock[]>('/stocks');
export const createStock = (stock: Partial<Stock>) => API.post<Stock>('/stocks', stock);
export const updateStock = (id: number, stock: Partial<Stock>) => API.put<Stock>(`/stocks/${id}`, stock);
export const deleteStock = (id: number) => API.delete(`/stocks/${id}`);
export const setStockCategories = (id: number, categoryIds: number[]) =>
  API.put<Stock>(`/stocks/${id}/categories`, categoryIds);
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
