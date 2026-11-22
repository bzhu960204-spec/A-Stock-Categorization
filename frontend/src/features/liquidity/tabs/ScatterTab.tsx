import { ReserveScatterChart } from '../charts/ReserveScatterChart';
import { useLiquidityScatter } from '../liquidityQueries';
import { formatValue } from '../liquidityUtils';
import styles from '../Liquidity.module.css';

export function ScatterTab() {
  const { data, isLoading, isError } = useLiquidityScatter();

  if (isError) return <div className={styles.notice} data-tone="error">加载失败</div>;
  if (isLoading || !data) return <div className={styles.notice}>加载中…</div>;
  if (data.length === 0) {
    return <div className={styles.notice}>暂无数据：散点图需要准备金与银行总资产（FRED），请先配置 FRED API Key 并同步。</div>;
  }
  const latest = data[data.length - 1];

  return (
    <div className={styles.scatter}>
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>准备金比例 vs TGCR − IORB（复刻高盛 Exhibit 5）</h3>
        <p className={styles.panelNote}>
          横轴越往左，系统准备金越稀缺；纵轴越高，回购利率相对 IORB 越贵。最新一周（周三 {latest.weekEnd}）：
          准备金比例 {formatValue(latest.ratio, '%')}，TGCR − IORB {formatValue(latest.tgcrIorb, 'bp')}。
        </p>
        <ReserveScatterChart points={data} />
        <p className={styles.footnote}>近似口径，仅供参考：高盛原图横轴用「周内最小值」，这里只有周度准备金（周均值），ON RRP 取当周日度均值。纵轴截取 −20 ~ +25bp，更极端的个别周（如 2018–2019 年）不显示。</p>
      </section>
    </div>
  );
}
