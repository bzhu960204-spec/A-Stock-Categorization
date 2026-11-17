import { describe, expect, it } from 'vitest';
import type { StockTimelineEntry } from './api';
import { groupEntriesByDay } from './timelineUtils';

let nextId = 1;
function entry(createdAt: string, actionType: string, description = '', id = nextId++): StockTimelineEntry {
  return { id, stockId: 1, stockCode: '600519', stockName: '贵州茅台', actionType, description, createdAt };
}

describe('groupEntriesByDay', () => {
  it('groups by local calendar day in ascending order', () => {
    const groups = groupEntriesByDay([
      entry('2026-03-02T10:00:00', 'UPDATE'),
      entry('2026-03-01T09:00:00', 'CREATE'),
      entry('2026-03-02T23:59:00', 'CATEGORY'),
    ]);
    expect(groups.map(g => g.key)).toEqual(['2026-03-01', '2026-03-02']);
    expect(groups[1].entries.map(e => e.actionType)).toEqual(['UPDATE', 'CATEGORY']);
  });

  it('keeps only the latest entry per action type within a day', () => {
    const groups = groupEntriesByDay([
      entry('2026-03-01T09:00:00', 'UPDATE', 'first', 10),
      entry('2026-03-01T11:00:00', 'UPDATE', 'second', 12),
      entry('2026-03-01T10:00:00', 'UPDATE', 'middle', 11),
    ]);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].entries[0].description).toBe('second');
  });

  it('tracks each document separately regardless of 新增/编辑/删除 prefix', () => {
    const groups = groupEntriesByDay([
      entry('2026-03-01T09:00:00', 'DOCUMENT', '新增文档：《A》', 20),
      entry('2026-03-01T09:10:00', 'DOCUMENT', '编辑文档：《A》', 21),
      entry('2026-03-01T09:20:00', 'DOCUMENT', '新增文档：《B》', 22),
      entry('2026-03-01T09:30:00', 'DOCUMENT', '删除文档：《B》', 23),
    ]);
    expect(groups[0].entries.map(e => e.description)).toEqual(['编辑文档：《A》', '删除文档：《B》']);
  });

  it('returns entries of a day sorted by id', () => {
    const groups = groupEntriesByDay([
      entry('2026-03-01T12:00:00', 'CATEGORY', '', 31),
      entry('2026-03-01T08:00:00', 'CREATE', '', 30),
    ]);
    expect(groups[0].entries.map(e => e.id)).toEqual([30, 31]);
  });

  it('handles an empty list', () => {
    expect(groupEntriesByDay([])).toEqual([]);
  });
});
