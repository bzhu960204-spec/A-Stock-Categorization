import { useMemo, useRef, useState } from 'react';
import type { ValuationSnapshot } from '../../api';
import {
  applyFilterRules, nextSort, searchSnapshots, sortSnapshots,
  type FilterLogic, type FilterRule, type SortDir, type SortKey,
} from './valuationUtils';

/** Search, rule filters and column sort of the snapshot list (kept in the module so they survive tab switches). */
export function useSnapshotListState(snapshots: ValuationSnapshot[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [logic, setLogic] = useState<FilterLogic>('AND');
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const nextRuleId = useRef(0);

  const visible = useMemo(
    () => sortSnapshots(applyFilterRules(searchSnapshots(snapshots, searchQuery), rules, logic), sort.key, sort.dir),
    [snapshots, searchQuery, rules, logic, sort],
  );

  return {
    searchQuery,
    setSearchQuery,
    rules,
    logic,
    toggleLogic: () => setLogic(l => (l === 'AND' ? 'OR' : 'AND')),
    addRule: () => {
      nextRuleId.current += 1;
      const id = nextRuleId.current;
      setRules(rs => [...rs, { id, key: 'pe', op: '<=', value: '' }]);
    },
    updateRule: (id: number, patch: Partial<FilterRule>) =>
      setRules(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r))),
    removeRule: (id: number) => setRules(rs => rs.filter(r => r.id !== id)),
    clearRules: () => setRules([]),
    sort,
    toggleSort: (key: SortKey) => setSort(cur => nextSort(cur, key)),
    visible,
  };
}

export type SnapshotListState = ReturnType<typeof useSnapshotListState>;
