import {
  Chart,
  ChartTypeRegistry,
  ScatterController,
  PointElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  Tooltip,
  Legend,
  ChartArea,
  UpdateMode,
  Plugin,
  Scale,
} from 'chart.js';

export interface IntervalPoint {
  x: number;
  y: number;
  lower: number;
  upper: number;
  axis: 'x' | 'y';
  label: string;
  significant?: boolean;
}
export interface MatrixPoint {
  x: number;
  y: number;
  label: string;
  symbol: string;
  fill: string;
  textColor: string;
}
declare module 'chart.js' {
  interface ChartTypeRegistry {
    lmmInterval: Omit<ChartTypeRegistry['scatter'], 'defaultDataPoint' | 'datasetOptions'> & {
      defaultDataPoint: IntervalPoint;
      datasetOptions: ChartTypeRegistry['scatter']['datasetOptions'] & { radius: number; hoverRadius: number };
    };
    significanceMatrix: Omit<ChartTypeRegistry['scatter'], 'defaultDataPoint'> & { defaultDataPoint: MatrixPoint };
  }
}

/** Exact category centers: linear-scale auto ticks may otherwise fall on half-integers. */
export const indexTicks = (count: number) => (scale: Scale) => {
  scale.ticks = Array.from({ length: count }, (_, value) => ({ value }));
};

/** Native Chart.js point with capped model uncertainty and interval hit-testing. */
export class IntervalPointElement extends PointElement {
  static override id = 'lmmIntervalPoint';
  lowerPixel = 0;
  upperPixel = 0;
  intervalAxis: 'x' | 'y' = 'y';
  override draw(ctx: CanvasRenderingContext2D, area: ChartArea): void {
    if (this.skip) return;
    ctx.save();
    ctx.strokeStyle = this.options.borderColor;
    ctx.lineWidth = this.options.borderWidth || 2;
    ctx.beginPath();
    if (this.intervalAxis === 'y') {
      ctx.moveTo(this.x, this.lowerPixel);
      ctx.lineTo(this.x, this.upperPixel);
      for (const y of [this.lowerPixel, this.upperPixel]) {
        ctx.moveTo(this.x - 5, y);
        ctx.lineTo(this.x + 5, y);
      }
    } else {
      ctx.moveTo(this.lowerPixel, this.y);
      ctx.lineTo(this.upperPixel, this.y);
      for (const x of [this.lowerPixel, this.upperPixel]) {
        ctx.moveTo(x, this.y - 5);
        ctx.lineTo(x, this.y + 5);
      }
    }
    ctx.stroke();
    ctx.restore();
    super.draw(ctx, area);
  }
  override inRange(x: number, y: number, final?: boolean): boolean {
    if (this.skip) return false;
    const lower = Math.min(this.lowerPixel, this.upperPixel) - 6;
    const upper = Math.max(this.lowerPixel, this.upperPixel) + 6;
    return (
      super.inRange(x, y, final) ||
      (this.intervalAxis === 'y'
        ? Math.abs(x - this.x) <= 8 && y >= lower && y <= upper
        : Math.abs(y - this.y) <= 8 && x >= lower && x <= upper)
    );
  }
}
export class IntervalController extends ScatterController {
  static override id = 'lmmInterval';
  static override defaults = { ...ScatterController.defaults, dataElementType: IntervalPointElement.id };
  override updateElements(elements: PointElement[], start: number, count: number, mode: UpdateMode): void {
    super.updateElements(elements, start, count, mode);
    const dataset = this.getDataset().data as IntervalPoint[];
    const meta = this.getMeta();
    for (let index = start; index < start + count; index++) {
      const raw = dataset[index];
      const point = elements[index] as IntervalPointElement;
      const scale = raw.axis === 'x' ? meta.xScale : meta.yScale;
      point.intervalAxis = raw.axis;
      point.lowerPixel = scale!.getPixelForValue(raw.lower);
      point.upperPixel = scale!.getPixelForValue(raw.upper);
    }
  }
}

/** Matrix cells use rectangular hit areas, not an overlay that loses tooltips. */
export class MatrixCellElement extends PointElement {
  static override id = 'significanceMatrixCell';
  width = 0;
  height = 0;
  fill = '';
  textColor = '';
  symbol = '';
  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.skip) return;
    ctx.save();
    ctx.fillStyle = this.fill;
    ctx.fillRect(this.x - this.width / 2 + 1, this.y - this.height / 2 + 1, this.width - 2, this.height - 2);
    ctx.fillStyle = this.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.min(14, Math.max(9, this.width / 3))}px sans-serif`;
    ctx.fillText(this.symbol, this.x, this.y, this.width - 4);
    ctx.restore();
  }
  override inRange(x: number, y: number): boolean {
    return !this.skip && Math.abs(x - this.x) <= this.width / 2 && Math.abs(y - this.y) <= this.height / 2;
  }
  override inXRange(x: number): boolean {
    return Math.abs(x - this.x) <= this.width / 2;
  }
  override inYRange(y: number): boolean {
    return Math.abs(y - this.y) <= this.height / 2;
  }
}
export class MatrixController extends ScatterController {
  static override id = 'significanceMatrix';
  static override defaults = { ...ScatterController.defaults, dataElementType: MatrixCellElement.id };
  override updateElements(elements: PointElement[], start: number, count: number, mode: UpdateMode): void {
    super.updateElements(elements, start, count, mode);
    const dataset = this.getDataset().data as MatrixPoint[];
    const { xScale, yScale } = this.getMeta();
    for (let index = start; index < start + count; index++) {
      const raw = dataset[index],
        cell = elements[index] as MatrixCellElement;
      cell.width = Math.abs(xScale!.getPixelForValue(raw.x + 0.5) - xScale!.getPixelForValue(raw.x - 0.5));
      cell.height = Math.abs(yScale!.getPixelForValue(raw.y + 0.5) - yScale!.getPixelForValue(raw.y - 0.5));
      cell.fill = raw.fill;
      cell.textColor = raw.textColor;
      cell.symbol = raw.symbol;
    }
  }
}

export const zeroReference: Plugin<'lmmInterval'> = {
  id: 'lmmZeroReference',
  beforeDatasetsDraw(chart) {
    const scale = chart.scales['x'];
    if (!scale || scale.min > 0 || scale.max < 0) return;
    const x = scale.getPixelForValue(0);
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = String(chart.options.color ?? '#64748b');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chart.chartArea.top);
    ctx.lineTo(x, chart.chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Tooltip,
  Legend,
  IntervalPointElement,
  IntervalController,
  MatrixCellElement,
  MatrixController,
);
