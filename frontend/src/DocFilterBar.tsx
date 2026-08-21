interface DocFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  starFilter: number;
  onStarFilterChange: (n: number) => void;
  /** Show the inline clear (✕) button when there is a search query. */
  showClear?: boolean;
}

/** Shared search + star-rating filter bar for the document modules. */
export default function DocFilterBar({
  search, onSearchChange, searchPlaceholder,
  starFilter, onStarFilterChange, showClear = true,
}: Readonly<DocFilterBarProps>) {
  return (
    <div className="rp-filter-bar">
      <div className="rp-search-wrap">
        <input
          className="rp-search-input"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        {showClear && search && (
          <button className="rp-scope-toggle" onClick={() => onSearchChange('')} title="清空搜索">✕</button>
        )}
      </div>
      <div className="rp-star-filters">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            className={`rp-star-filter-btn${starFilter === n ? ' active' : ''}`}
            onClick={() => onStarFilterChange(n)}
            title={n === 0 ? '全部' : `${n}星及以上`}
          >
            {n === 0 ? '全部' : '★'.repeat(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
