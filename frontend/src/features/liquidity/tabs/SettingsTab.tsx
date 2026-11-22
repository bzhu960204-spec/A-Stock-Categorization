import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createLiquidityManualSeries, deleteLiquidityManualSeries, deleteLiquidityObservation, getErrorMessage,
  resetLiquidityThreshold, saveLiquidityObservations, saveLiquidityThreshold, SYNC_SOURCES,
  type LiquidityManualSeries, type LiquidityThresholdView, type SyncMode, type SyncSource, type ThresholdDirection,
} from '../../../api';
import { useConfirm, useToast } from '../../../shared/ui/feedback/useFeedback';
import {
  LIQUIDITY_KEY, useLiquidityManualSeries, useLiquiditySeries, useLiquiditySyncStatus, useLiquidityThresholds,
} from '../liquidityQueries';
import { describeProgress, elapsedText, formatValue, isOrphanedRun, MANUAL_CODE_PATTERN, parseObservationLines, subtractMonths, todayIso } from '../liquidityUtils';
import styles from '../Liquidity.module.css';

interface Props {
  fredConfigured: boolean;
  onStartSync: (mode: SyncMode, source?: SyncSource) => void;
}

const STATUS_TEXT = { RUNNING: '运行中', SUCCESS: '成功', FAILED: '失败', SKIPPED: '已跳过' } as const;
const SOURCE_LABEL: Partial<Record<SyncSource, string>> = { FEDTEXT: 'FEDTEXT（联储文本）' };

// ---------- sync ----------

function SyncSection({ onStartSync }: { onStartSync: Props['onStartSync'] }) {
  const confirm = useConfirm();
  const { data } = useLiquiditySyncStatus();
  const running = data?.running ?? false;
  const current = data?.current ?? null;
  const [source, setSource] = useState<SyncSource | ''>('');
  const target = source || undefined;

  async function fullRebuild() {
    const ok = await confirm({
      message: `全量重建会重新拉取${source ? ` ${source} ` : ''}2007 年至今的全部历史数据，可能需要数分钟（单个数据源最长 15 分钟后会自动中止）。继续吗？`,
      confirmText: '开始重建',
    });
    if (ok) onStartSync('FULL', target);
  }

  const idleText = '空闲（每天 09:30 / 22:30 自动增量同步）';

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>数据同步</h3>
      <div className={styles.btnRow}>
        <select className={styles.input} value={source} onChange={e => setSource(e.target.value as SyncSource | '')}
                disabled={running} aria-label="同步数据源">
          <option value="">全部数据源</option>
          {SYNC_SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>)}
        </select>
        <button type="button" className="confirm-btn" onClick={() => onStartSync('INCREMENTAL', target)} disabled={running}>增量同步</button>
        <button type="button" className="cancel-btn" onClick={fullRebuild} disabled={running}>全量重建历史</button>
        <span className={styles.muted} role="status">
          {running
            ? `同步进行中：${current ? `${describeProgress(current)}（已运行 ${elapsedText(current.startedAt, null)}）` : '准备中…'}`
            : idleText}
        </span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr><th>数据源</th><th>模式</th><th>区间</th><th>状态</th><th className={styles.num}>行数</th><th>耗时</th><th>信息</th></tr>
        </thead>
        <tbody>
          {(data?.lastLogs ?? []).map(l => {
            const orphaned = isOrphanedRun(l, running);
            const message = orphaned ? '同步已中断（应用重启或异常退出），未完成' : l.message;
            return (
              <tr key={l.id}>
                <td>{l.source}</td>
                <td>{l.mode === 'FULL' ? '全量' : '增量'}</td>
                <td>{l.rangeFrom ?? '—'} ~ {l.rangeTo ?? '—'}</td>
                <td data-log-status={orphaned ? 'INTERRUPTED' : l.status}>{orphaned ? '已中断' : STATUS_TEXT[l.status]}</td>
                <td className={styles.num}>{l.rowsUpserted}</td>
                <td>{orphaned ? '—' : elapsedText(l.startedAt, l.finishedAt)}</td>
                <td className={styles.logMessage} title={message ?? undefined}>{message ?? ''}</td>
              </tr>
            );
          })}
          {data && data.lastLogs.length === 0 && <tr><td colSpan={7} className={styles.muted}>暂无同步记录</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

// ---------- thresholds ----------

function ThresholdRow({ view }: { view: LiquidityThresholdView }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<ThresholdDirection>(view.rule.direction);
  const [yellow, setYellow] = useState(String(view.rule.yellow));
  const [red, setRed] = useState(String(view.rule.red));
  const [enabled, setEnabled] = useState(view.rule.enabled);
  const [busy, setBusy] = useState(false);

  const changed = direction !== view.rule.direction || Number(yellow) !== view.rule.yellow
    || Number(red) !== view.rule.red || enabled !== view.rule.enabled;
  const valid = yellow.trim() !== '' && red.trim() !== '' && Number.isFinite(Number(yellow)) && Number.isFinite(Number(red));

  const refresh = () => queryClient.invalidateQueries({ queryKey: LIQUIDITY_KEY });

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败，请重试。'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{view.name}<div className={styles.rowNote}>{view.code} · {view.unit}</div></td>
      <td>
        <select className={styles.input} value={direction} onChange={e => setDirection(e.target.value as ThresholdDirection)}>
          <option value="HIGHER_IS_WORSE">越高越差</option>
          <option value="LOWER_IS_WORSE">越低越差</option>
        </select>
      </td>
      <td><input className={styles.inputNarrow} type="number" step="any" value={yellow} onChange={e => setYellow(e.target.value)} /></td>
      <td><input className={styles.inputNarrow} type="number" step="any" value={red} onChange={e => setRed(e.target.value)} /></td>
      <td><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} aria-label="启用" /></td>
      <td className={styles.rowActions}>
        <button type="button" className="confirm-btn" disabled={busy || !changed || !valid}
                onClick={() => run(() => saveLiquidityThreshold(view.code, { direction, yellow: Number(yellow), red: Number(red), enabled }), '阈值已保存')}>
          保存
        </button>
        {view.customized && (
          <button type="button" className="cancel-btn" disabled={busy}
                  onClick={() => run(() => resetLiquidityThreshold(view.code), '已恢复默认')}>恢复默认</button>
        )}
      </td>
    </tr>
  );
}

function ThresholdSection() {
  const { data } = useLiquidityThresholds();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>状态灯阈值</h3>
      <p className={styles.panelNote}>阈值含边界：越高越差时，值 ≥ 红色阈值为红、≥ 黄色阈值为黄；越低越差则相反。综合状态取五个核心指标（SOFR−IORB、TGCR−IORB、SOFR 99 分位−IORB、准备金比例、SRF 用量）中最差的一个。</p>
      <table className={styles.table}>
        <thead><tr><th>指标</th><th>方向</th><th>黄色</th><th>红色</th><th>启用</th><th /></tr></thead>
        <tbody>
          {data?.map(view => (
            // The key includes the stored rule so the row re-initialises after a save or reset.
            <ThresholdRow key={`${view.code}:${JSON.stringify(view.rule)}`} view={view} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------- manual series ----------

function ManualSeriesCard({ series }: { series: LiquidityManualSeries }) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [value, setValue] = useState('');
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const recent = useLiquiditySeries([series.code], subtractMonths(today, 60), today);
  const rows = (recent.data?.[series.code] ?? []).slice(-20).reverse();
  const refresh = () => queryClient.invalidateQueries({ queryKey: LIQUIDITY_KEY });

  async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      await refresh();
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请重试。'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addOne() {
    const v = Number(value);
    if (!date || value.trim() === '' || !Number.isFinite(v)) {
      toast.error('请填写日期和有效数值');
      return;
    }
    if (await run(() => saveLiquidityObservations(series.code, [{ date, value: v }]), '已保存')) setValue('');
  }

  async function addBulk() {
    const parsed = parseObservationLines(bulk);
    if (parsed.errors.length > 0) {
      toast.error(parsed.errors.slice(0, 3).join('；'));
      return;
    }
    if (parsed.points.length === 0) {
      toast.error('没有可保存的行');
      return;
    }
    if (await run(() => saveLiquidityObservations(series.code, parsed.points), `已保存 ${parsed.points.length} 条`)) setBulk('');
  }

  async function removeSeries() {
    const ok = await confirm({
      message: `确定删除手动序列「${series.name}」及其全部观测值？此操作不可恢复。`, confirmText: '删除', danger: true,
    });
    if (ok) await run(() => deleteLiquidityManualSeries(series.code), '已删除');
  }

  return (
    <div className={styles.manualCard}>
      <div className={styles.manualHead}>
        <strong>{series.name}</strong>
        <span className={styles.muted}>{series.code} · {series.unit}</span>
        <button type="button" className="cancel-btn" onClick={removeSeries} disabled={busy}>删除序列</button>
      </div>
      {series.description && <p className={styles.panelNote}>{series.description}</p>}
      <div className={styles.inlineForm}>
        <input className={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input className={styles.inputNarrow} type="number" step="any" placeholder="数值" value={value}
               onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addOne(); }} />
        <button type="button" className="confirm-btn" onClick={addOne} disabled={busy}>录入</button>
      </div>
      <textarea className={styles.commentary} rows={3} value={bulk} onChange={e => setBulk(e.target.value)}
                placeholder={'批量录入：每行 YYYY-MM-DD,数值\n2026-11-18,305\n2026-11-19,257'} />
      <div className={styles.btnRow}>
        <button type="button" className="cancel-btn" onClick={addBulk} disabled={busy || !bulk.trim()}>批量保存</button>
      </div>
      <table className={styles.table}>
        <thead><tr><th>最近 20 条</th><th className={styles.num}>数值</th><th /></tr></thead>
        <tbody>
          {rows.map(([d, v]) => (
            <tr key={d}>
              <td>{d}</td>
              <td className={styles.num}>{formatValue(v, series.unit)}</td>
              <td className={styles.rowActions}>
                <button type="button" className="cancel-btn" disabled={busy}
                        onClick={() => run(() => deleteLiquidityObservation(series.code, d))}>删除</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className={styles.muted}>暂无观测值</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const ORCL_CDS = { code: 'CDS_ORCL_5Y', name: '甲骨文 5 年期 CDS', unit: 'bp', description: '手动录入（无免费数据源）' };

function ManualSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useLiquidityManualSeries();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('bp');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = code.trim().toUpperCase();
  const codeValid = MANUAL_CODE_PATTERN.test(normalized);
  const hasOrcl = data?.some(s => s.code === ORCL_CDS.code) ?? false;

  async function create(payload: { code: string; name: string; unit: string; description?: string }) {
    setBusy(true);
    try {
      await createLiquidityManualSeries(payload);
      await queryClient.invalidateQueries({ queryKey: LIQUIDITY_KEY });
      toast.success('已创建');
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, '创建失败，请重试。'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (await create({ code: normalized, name: name.trim(), unit: unit.trim(), description: description.trim() || undefined })) {
      setCode(''); setName(''); setDescription('');
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>手动序列（如 CDS）</h3>
      <p className={styles.panelNote}>没有免费接口的数据在这里手工录入，会与内置序列一起出现在趋势图和周报里。代码必须以 M_ 或 CDS_ 开头。</p>
      <div className={styles.inlineForm}>
        <input className={styles.input} placeholder="代码，如 CDS_ORCL_5Y" value={code} onChange={e => setCode(e.target.value)} />
        <input className={styles.input} placeholder="名称" value={name} onChange={e => setName(e.target.value)} />
        <input className={styles.inputNarrow} placeholder="单位" value={unit} onChange={e => setUnit(e.target.value)} />
        <input className={styles.input} placeholder="说明（可选）" value={description} onChange={e => setDescription(e.target.value)} />
        <button type="button" className="confirm-btn" onClick={submit} disabled={busy || !codeValid || !name.trim() || !unit.trim()}>新建序列</button>
        {!hasOrcl && <button type="button" className="cancel-btn" onClick={() => create(ORCL_CDS)} disabled={busy}>添加甲骨文 5Y CDS</button>}
      </div>
      {code.trim() !== '' && !codeValid && <div className={styles.fieldError}>代码需以 M_ 或 CDS_ 开头，只含大写字母、数字、下划线</div>}
      {data?.map(series => <ManualSeriesCard key={series.code} series={series} />)}
    </section>
  );
}

export function SettingsTab({ fredConfigured, onStartSync }: Props) {
  return (
    <div className={styles.settings}>
      {!fredConfigured && (
        <div className={styles.notice} data-tone="warn">
          未配置 FRED API Key：FRED 数据源（IORB、准备金、银行总资产、高收益债利差）会被跳过。请到首页 ⚙ 设置中填写。
        </div>
      )}
      <SyncSection onStartSync={onStartSync} />
      <ThresholdSection />
      <ManualSection />
    </div>
  );
}
