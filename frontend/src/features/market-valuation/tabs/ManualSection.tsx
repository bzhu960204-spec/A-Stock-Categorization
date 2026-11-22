import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createMvManualSeries, deleteMvManualSeries, deleteMvObservation, getErrorMessage, saveMvObservations, type MvManualSeries,
} from '../../../api';
import { useConfirm, useToast } from '../../../shared/ui/feedback/useFeedback';
import { parseObservationLines, subtractMonths, todayIso } from '../../liquidity/liquidityUtils';
import { MV_KEY, useMvManualSeries, useMvSeries } from '../mvQueries';
import { formatMvValue, MANUAL_PRESETS, MV_MANUAL_CODE_PATTERN } from '../mvUtils';
import styles from '../MarketValuation.module.css';

function ManualSeriesCard({ series }: { series: MvManualSeries }) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [value, setValue] = useState('');
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const recent = useMvSeries([series.code], subtractMonths(today, 600), today);
  const rows = (recent.data?.series[series.code] ?? []).slice(-20).reverse();

  async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: MV_KEY });
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
    if (await run(() => saveMvObservations(series.code, [{ date, value: v }]), '已保存')) setValue('');
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
    if (await run(() => saveMvObservations(series.code, parsed.points), `已保存 ${parsed.points.length} 条`)) setBulk('');
  }

  async function removeSeries() {
    const ok = await confirm({
      message: `确定删除手动序列「${series.name}」及其全部观测值？此操作不可恢复。`, confirmText: '删除', danger: true,
    });
    if (ok) await run(() => deleteMvManualSeries(series.code), '已删除');
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
                placeholder={'批量录入：每行 YYYY-MM-DD,数值\n2026-09-30,14.9\n2026-06-30,13.8'} />
      <div className={styles.btnRow}>
        <button type="button" className="cancel-btn" onClick={addBulk} disabled={busy || !bulk.trim()}>批量保存</button>
      </div>
      <table className={styles.table}>
        <thead><tr><th>最近 20 条</th><th className={styles.num}>数值</th><th /></tr></thead>
        <tbody>
          {rows.map(([d, v]) => (
            <tr key={d}>
              <td>{d}</td>
              <td className={styles.num}>{formatMvValue(v, series.unit)}</td>
              <td className={styles.rowActions}>
                <button type="button" className="cancel-btn" disabled={busy}
                        onClick={() => run(() => deleteMvObservation(series.code, d))}>删除</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className={styles.muted}>暂无观测值</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ManualSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useMvManualSeries();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('%');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = code.trim().toUpperCase();
  const codeValid = MV_MANUAL_CODE_PATTERN.test(normalized);
  const existing = new Set((data ?? []).map(s => s.code));
  const missingPresets = MANUAL_PRESETS.filter(p => !existing.has(p.code));

  async function create(payload: { code: string; name: string; unit: string; description?: string }) {
    setBusy(true);
    try {
      await createMvManualSeries(payload);
      await queryClient.invalidateQueries({ queryKey: MV_KEY });
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
      <h3 className={styles.sectionTitle}>手动序列</h3>
      <p className={styles.panelNote}>没有免费来源的数据（如纳指 100 的 ROE / 净利率、回购收益率）在这里手工录入，会出现在趋势图的自定义面板里。代码必须以 M_ 开头。</p>
      {missingPresets.length > 0 && (
        <div className={styles.btnRow}>
          <span className={styles.muted}>一键添加：</span>
          {missingPresets.map(p => (
            <button key={p.code} type="button" className="cancel-btn" disabled={busy} title={p.description}
                    onClick={() => create({ code: p.code, name: p.name, unit: p.unit, description: p.description })}>
              + {p.name}
            </button>
          ))}
        </div>
      )}
      <div className={styles.inlineForm}>
        <input className={styles.input} placeholder="代码，如 M_SPX_FCF_YIELD" value={code} onChange={e => setCode(e.target.value)} />
        <input className={styles.input} placeholder="名称" value={name} onChange={e => setName(e.target.value)} />
        <input className={styles.inputNarrow} placeholder="单位" value={unit} onChange={e => setUnit(e.target.value)} />
        <input className={styles.input} placeholder="说明（可选）" value={description} onChange={e => setDescription(e.target.value)} />
        <button type="button" className="confirm-btn" onClick={submit} disabled={busy || !codeValid || !name.trim() || !unit.trim()}>新建序列</button>
      </div>
      {code.trim() !== '' && !codeValid && <div className={styles.fieldError}>代码需以 M_ 开头，只含大写字母、数字、下划线</div>}
      {data?.map(series => <ManualSeriesCard key={series.code} series={series} />)}
    </section>
  );
}
