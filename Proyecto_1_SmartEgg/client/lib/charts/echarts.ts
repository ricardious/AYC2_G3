import * as echarts from "echarts/core";
import {
  CustomChart,
  EffectScatterChart,
  GaugeChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// Sólo lo que dibuja Historial: el paquete completo pesa cuatro veces más.
echarts.use([
  CustomChart,
  EffectScatterChart,
  GaugeChart,
  LineChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsOption } from "echarts";
