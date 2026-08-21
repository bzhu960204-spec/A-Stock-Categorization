interface DocCategoryPillsProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

/** Shared sub-category / category pill filter for the document modules. */
export default function DocCategoryPills({ options, value, onChange }: Readonly<DocCategoryPillsProps>) {
  return (
    <div className="doc-category-pills">
      {options.map(cat => (
        <button
          key={cat}
          className={`doc-category-pill${value === cat ? ' active' : ''}`}
          onClick={() => onChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
