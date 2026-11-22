import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TitleComponent,
  TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ComposeOption } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type {
  DataZoomComponentOption, GridComponentOption, LegendComponentOption, MarkAreaComponentOption, MarkLineComponentOption,
  TitleComponentOption, TooltipComponentOption, VisualMapComponentOption,
} from 'echarts/components';

// Only the pieces the liquidity charts use are registered, to keep the vendor-echarts chunk small.
echarts.use([
  LineChart, BarChart, ScatterChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent,
  VisualMapComponent, TitleComponent,
  CanvasRenderer,
]);

export type ECOption = ComposeOption<
  | LineSeriesOption | BarSeriesOption | ScatterSeriesOption
  | GridComponentOption | TooltipComponentOption | LegendComponentOption | DataZoomComponentOption
  | MarkLineComponentOption | MarkAreaComponentOption | VisualMapComponentOption | TitleComponentOption
>;

export { echarts };
