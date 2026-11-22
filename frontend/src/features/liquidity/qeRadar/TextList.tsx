import { useMemo, useState } from 'react';
import type { FedTextSummary } from '../../../api';
import { useQeText, useQeTexts } from '../liquidityQueries';
import { formatValue } from '../liquidityUtils';
import { categoryInfo, DOC_TYPE_LABEL, splitByHits } from './qeRadarUtils';
import styles from '../Liquidity.module.css';

function CategoryTag({ category }: { category: string }) {
  const info = categoryInfo(category);
  return <span className={styles.catTag} data-level={info.level ?? ''} title={category}>{info.label}</span>;
}

function TextDetail({ id }: { id: number }) {
  const { data, isLoading, isError } = useQeText(id);
  const body = useMemo(
    () => (data ? splitByHits(data.body, data.hits.map(h => h.sentence)) : []),
    [data],
  );

  if (isError) return <div className={styles.notice} data-tone="error">文本加载失败</div>;
  if (isLoading || !data) return <div className={styles.notice}>加载中…</div>;

  const changes = data.directiveChanges;
  return (
    <div className={styles.textDetail}>
      {data.hits.length > 0 ? (
        <>
          <div className={styles.subTitle}>命中句子</div>
          <ul className={styles.obsList}>
            {data.hits.map((h, i) => (
              <li key={`${h.category}-${i}`}><CategoryTag category={h.category} /> {h.sentence}</li>
            ))}
          </ul>
        </>
      ) : <div className={styles.muted}>没有命中任何类别</div>}

      {changes && (changes.added.length > 0 || changes.removed.length > 0) && (
        <>
          <div className={styles.subTitle}>指令对比（相对上一份实施细则）</div>
          <ul className={styles.diffList}>
            {changes.added.map((s, i) => <li key={`a${i}`} className={styles.diffAdded}>＋ {s}</li>)}
            {changes.removed.map((s, i) => <li key={`r${i}`} className={styles.diffRemoved}>－ {s}</li>)}
          </ul>
        </>
      )}

      <details className={styles.bodyToggle}>
        <summary>查看正文</summary>
        <p className={styles.bodyText}>
          {body.map((seg, i) => (seg.hit ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>))}
        </p>
      </details>
    </div>
  );
}

function TextRow({ text, expanded, onToggle }: { text: FedTextSummary; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className={styles.clickRow} onClick={onToggle}>
        <td className={styles.nowrap}>{text.docDate}</td>
        <td className={styles.nowrap}>{DOC_TYPE_LABEL[text.docType] ?? text.docType}</td>
        <td>
          <a href={text.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{text.title}</a>
          {text.hasDirectiveChanges && <span className={styles.catTag} data-level="">指令有变化</span>}
        </td>
        <td>
          <div className={styles.tagList}>
            {text.categories.map(c => <CategoryTag key={c} category={c} />)}
          </div>
        </td>
        <td className={styles.num}>{text.docType === 'MINUTES' ? '—' : formatValue(text.stance, 'stance')}</td>
        <td className={styles.expandMark} aria-hidden>{expanded ? '▾' : '▸'}</td>
      </tr>
      {expanded && <tr><td colSpan={6}><TextDetail id={text.id} /></td></tr>}
    </>
  );
}

export function TextList() {
  const { data, isLoading, isError } = useQeTexts();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isError) return <div className={styles.notice} data-tone="error">联储文本加载失败</div>;
  if (isLoading || !data) return <div className={styles.notice}>加载中…</div>;
  if (data.length === 0) return <div className={styles.notice}>还没有联储文本（请到设置页同步 FEDTEXT 数据源）</div>;

  return (
    <section className={styles.panel}>
      <p className={styles.panelNote}>
        对 FOMC 声明、实施细则等逐句匹配关键词并打分（stance &gt; 0 偏宽松，&lt; 0 偏紧缩）。会议纪要只展示命中结果，不参与评分。点击一行展开。
      </p>
      <table className={styles.table}>
        <thead>
          <tr><th>日期</th><th>类型</th><th>标题</th><th>类别</th><th className={styles.num}>stance</th><th /></tr>
        </thead>
        <tbody>
          {data.map(t => (
            <TextRow key={t.id} text={t} expanded={expandedId === t.id} onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
