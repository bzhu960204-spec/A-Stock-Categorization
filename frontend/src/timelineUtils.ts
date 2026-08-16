import type { StockTimelineEntry } from './api';

export function groupEntriesByDay(entries: StockTimelineEntry[]) {
  const map = new Map<string, StockTimelineEntry[]>();
  for (const e of entries) {
    const dt = new Date(e.createdAt);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dayEntries]) => {
      // Deduplicate: for each actionType (+ document title for DOCUMENT actions),
      // keep only the last entry (highest id = most recent write).
      const deduped = new Map<string, StockTimelineEntry>();
      for (const e of dayEntries) {
        // For DOCUMENT actions include the title so each document is tracked separately
        const dedupeKey = e.actionType === 'DOCUMENT'
          ? `${e.actionType}::${e.description.replace(/^(新增|编辑|删除)文档：/, '')}`
          : e.actionType;
        const existing = deduped.get(dedupeKey);
        if (!existing || e.id > existing.id) {
          deduped.set(dedupeKey, e);
        }
      }
      return { key, entries: Array.from(deduped.values()).sort((a, b) => a.id - b.id) };
    });
}
