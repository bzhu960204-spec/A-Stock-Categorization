import type { ValuationSnapshot } from '../../api';
import { avgGrossMargin, avgNetIncome, fmtNum } from './valuationUtils';
import type { HoverTipState, OpenTip, TipLine } from './useHoverTip';

export interface TipHandlers {
  openTip: OpenTip;
  closeTip: () => void;
}

function TipValue({ lines, text, openTip, closeTip }: TipHandlers & { lines: TipLine[]; text: string }) {
  return (
    <span className="val-ni-avg" onMouseEnter={e => openTip(e, lines)} onMouseLeave={closeTip}>{text}</span>
  );
}

const quarterLines = (q: [number | null | undefined, number | null | undefined, number | null | undefined, number | null | undefined]): TipLine[] => [
  { label: 'Q1 (最早)', value: fmtNum(q[0], true) },
  { label: 'Q2', value: fmtNum(q[1], true) },
  { label: 'Q3', value: fmtNum(q[2], true) },
  { label: 'Q4 (最新)', value: fmtNum(q[3], true) },
];

/** Quarterly-average gross margin; falls back to the TTM figure when no quarters are recorded. */
export function GrossMarginValue({ s, ...tip }: TipHandlers & { s: ValuationSnapshot }) {
  const avg = avgGrossMargin(s);
  if (avg == null) return <>{fmtNum(s.grossMargin, true)}</>;
  return <TipValue {...tip} text={fmtNum(avg, true)} lines={quarterLines([s.grossMarginQ1, s.grossMarginQ2, s.grossMarginQ3, s.grossMarginQ4])} />;
}

export function NetMarginAvgValue({ s, ...tip }: TipHandlers & { s: ValuationSnapshot }) {
  const avg = avgNetIncome(s);
  if (avg == null) return <>—</>;
  return <TipValue {...tip} text={fmtNum(avg, true)} lines={quarterLines([s.netMarginQ1, s.netMarginQ2, s.netMarginQ3, s.netMarginQ4])} />;
}

/** Latest TTM ROIC, with the 4-year history on hover when available. */
export function RoicValue({ s, ...tip }: TipHandlers & { s: ValuationSnapshot }) {
  const roic = s.ttmRoicY4;
  if (roic == null) return <>—</>;
  const hasHistory = [s.ttmRoicY1, s.ttmRoicY2, s.ttmRoicY3].some(v => v != null);
  if (!hasHistory) return <>{fmtNum(roic, true)}</>;
  return (
    <TipValue {...tip} text={fmtNum(roic, true)} lines={[
      { label: 'Y1 (最早)', value: fmtNum(s.ttmRoicY1, true) },
      { label: 'Y2',        value: fmtNum(s.ttmRoicY2, true) },
      { label: 'Y3',        value: fmtNum(s.ttmRoicY3, true) },
      { label: 'Y4 (最新)', value: fmtNum(s.ttmRoicY4, true) },
    ]} />
  );
}

export function HoverTip({ tip }: { tip: HoverTipState | null }) {
  if (!tip) return null;
  return (
    <div
      className="val-ni-tip-fixed"
      style={{
        left: tip.x,
        ...(tip.above ? { top: tip.y, transform: 'translateY(-100%)' } : { top: tip.y }),
      }}
    >
      {tip.lines.map(l => (
        <span key={l.label}>{l.label}: {l.value}</span>
      ))}
    </div>
  );
}
