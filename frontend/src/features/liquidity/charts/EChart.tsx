import { useEffect, useRef } from 'react';
import { echarts, type ECOption } from './echartsCore';
import { useChartPalette, type ChartPalette } from './chartPalette';

interface Props {
  option: ECOption;
  height?: number;
  label: string;
}

/** An ECharts theme built from the current CSS theme, so axes, legends and tooltips match the page. */
function buildEChartsTheme(p: ChartPalette) {
  const axis = {
    axisLine: { lineStyle: { color: p.border } },
    axisTick: { lineStyle: { color: p.border } },
    axisLabel: { color: p.textMuted },
    nameTextStyle: { color: p.textMuted },
    splitLine: { lineStyle: { color: p.grid } },
  };
  return {
    color: p.series,
    backgroundColor: 'transparent',
    textStyle: { color: p.text },
    title: { textStyle: { color: p.text }, subtextStyle: { color: p.textMuted } },
    legend: { textStyle: { color: p.text }, pageTextStyle: { color: p.textMuted }, inactiveColor: p.border },
    tooltip: {
      backgroundColor: p.tooltipBackground,
      borderColor: p.border,
      textStyle: { color: p.text },
      axisPointer: { lineStyle: { color: p.textMuted }, crossStyle: { color: p.textMuted } },
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    dataZoom: {
      borderColor: p.border, textStyle: { color: p.textMuted }, dataBackground: { lineStyle: { color: p.border }, areaStyle: { color: p.grid } },
      handleStyle: { color: p.textMuted, borderColor: p.textMuted }, moveHandleStyle: { color: p.border },
    },
  };
}

/** Thin ECharts wrapper: init, setOption, resize, dispose, and re-creation when the theme changes. */
export function EChart({ option, height = 300, label }: Props) {
  const palette = useChartPalette();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const themeName = `liquidity-${palette.themeId}`;
    echarts.registerTheme(themeName, buildEChartsTheme(palette));
    const instance = echarts.init(el, themeName);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [palette]);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option, palette]);

  return <div ref={host} style={{ width: '100%', height }} role="img" aria-label={label} />;
}
