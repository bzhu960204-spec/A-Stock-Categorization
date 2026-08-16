export const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#a855f7',
];

export const actionTypeLabelMap: Record<string, string> = {
  CREATE: '新增',
  UPDATE: '编辑',
  CATEGORY: '分类',
  DELETE: '删除',
  DOCUMENT: '文档',
  EARNINGS: '财报',
};

export const KNOWN_MARKETS = ['CN', 'US', 'JP', 'KR', 'TW', 'HK', 'OTHER'] as const;

export const MARKET_LABEL: Record<string, string> = { CN: 'A股', US: '美股', JP: '日股', KR: '韩股', TW: '台股', HK: '港股', OTHER: '其它市场' };
