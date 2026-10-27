import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { Chart, ChartConfiguration } from 'chart.js';
import { ThemeService } from '../../shared/services/theme.service';
import { EmmPlotComponent } from './emm-plot.component';
import { TukeyForestPlotComponent } from './tukey-forest-plot.component';
import { SignificanceHeatmapComponent } from './significance-heatmap.component';
import { ParticipantSpaghettiPlotComponent } from './participant-spaghetti-plot.component';
import { IntervalPointElement, MatrixCellElement } from './listening-chart-extensions';
import { ChartCondition } from './listening-chart-data';

const conditions: ChartCondition[] = [
  { id: 'b', name: 'PLC B', module_index: 1 },
  { id: 'a', name: 'PLC A', module_index: 0 },
  { id: 'c', name: 'PLC C', module_index: 2 },
];
const pairs = [
  { first: 'a', second: 'b', effect: -12, ci95: [-15, -9] as [number, number], p: 0.001, p_adjusted: 0.02 },
];

describe('Standalone LMM Chart.js visualizations', () => {
  let theme: BehaviorSubject<boolean>;
  beforeEach(async () => {
    theme = new BehaviorSubject(false);
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    await TestBed.configureTestingModule({
      imports: [
        EmmPlotComponent,
        TukeyForestPlotComponent,
        SignificanceHeatmapComponent,
        ParticipantSpaghettiPlotComponent,
      ],
      providers: [provideNoopAnimations(), { provide: ThemeService, useValue: { isDarkMode: theme } }],
    }).compileComponents();
  });
  async function render<T>(type: Type<T>, inputs: Record<string, unknown>): Promise<ComponentFixture<T>> {
    const fixture = TestBed.createComponent(type);
    fixture.componentRef.setInput('conditions', conditions);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  function chart<T>(fixture: ComponentFixture<T>): Chart {
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.getAttribute('aria-label')).toBeTruthy();
    const result = Chart.getChart(canvas)!;
    expect(result).toBeDefined();
    return result;
  }
  it('renders real capped EMM intervals, expands bounds, updates themes and disposes charts', async () => {
    const fixture = await render(EmmPlotComponent, {
      means: [
        { id: 'b', mean: 0, se: 1, ci95: [-2, 2] },
        { id: 'a', mean: 99, se: 3, ci95: [93, 105] },
      ],
    });
    const actual = chart(fixture);
    expect((actual.config as ChartConfiguration).type).toBe('lmmInterval');
    const point = actual.getDatasetMeta(0).data[0] as IntervalPointElement;
    expect(point instanceof IntervalPointElement).toBeTrue();
    expect(point.intervalAxis).toBe('y');
    expect(point.lowerPixel).toBeCloseTo(actual.scales['y'].getPixelForValue(-2));
    expect(point.upperPixel).toBeCloseTo(actual.scales['y'].getPixelForValue(2));
    expect(point.inRange(point.x, point.upperPixel)).toBeTrue();
    expect(actual.scales['y'].min).toBeLessThan(-2);
    expect(actual.scales['y'].max).toBeGreaterThan(105);
    expect(actual.options.animation).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('not Tukey-adjusted');
    expect(actual.scales['x'].ticks.map((tick) => tick.label)).toEqual(['#2 PLC B', '#1 PLC A', '#3 PLC C']);
    expect(point.options.radius).toBe(5);
    expect(point.options.borderColor).toBe('#2563eb');
    theme.next(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((chart(fixture).getDatasetMeta(0).data[0] as IntervalPointElement).options.borderColor).toBe('#60a5fa');
    const canvas = fixture.nativeElement.querySelector('canvas');
    fixture.destroy();
    expect(Chart.getChart(canvas)).toBeUndefined();
  });
  it('renders horizontal Tukey intervals and zero line without reversing probabilities', async () => {
    const fixture = await render(TukeyForestPlotComponent, { pairs });
    const actual = chart(fixture);
    const point = actual.getDatasetMeta(0).data[0] as IntervalPointElement;
    expect(point.intervalAxis).toBe('x');
    expect(point.lowerPixel).toBeCloseTo(actual.scales['x'].getPixelForValue(9));
    expect(point.upperPixel).toBeCloseTo(actual.scales['x'].getPixelForValue(15));
    expect(actual.scales['x'].min).toBe(-actual.scales['x'].max);
    expect(fixture.componentInstance.points[0].p_adjusted).toBe(0.02);
    expect(actual.config.plugins?.some((plugin) => plugin.id === 'lmmZeroReference')).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Simultaneous 95% CI');
  });
  it('renders rectangular matrix cells with hit-testing, missing cells and accessible p-values', async () => {
    const fixture = await render(SignificanceHeatmapComponent, { pairs });
    const actual = chart(fixture);
    expect((actual.config as ChartConfiguration).type).toBe('significanceMatrix');
    const cell = actual.getDatasetMeta(0).data[1] as MatrixCellElement;
    expect(cell instanceof MatrixCellElement).toBeTrue();
    expect(cell.width).toBeGreaterThan(0);
    expect(cell.height).toBeGreaterThan(0);
    expect(actual.scales['x'].ticks.map((tick) => tick.label)).toEqual(['#2 PLC B', '#1 PLC A', '#3 PLC C']);
    expect(actual.scales['y'].ticks.map((tick) => tick.label)).toEqual(['#2 PLC B', '#1 PLC A', '#3 PLC C']);
    expect(cell.symbol).toBe('*');
    expect(cell.inRange(cell.x + cell.width / 2 - 1, cell.y)).toBeTrue();
    expect(cell.inRange(cell.x + cell.width, cell.y)).toBeFalse();
    expect(fixture.componentInstance.cells[0].symbol).toBe('—');
    expect(fixture.componentInstance.cells[2].symbol).toBe('?');
    expect(fixture.nativeElement.querySelector('table').textContent).toContain('0.020000');
    const before = fixture.componentInstance.cells[1].fill;
    theme.next(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.cells[1].fill).not.toBe(before);
    const current = chart(fixture);
    current.resize(700, 430);
    expect((current.getDatasetMeta(0).data[1] as MatrixCellElement).width).toBeGreaterThan(0);
  });
  it('renders one line per listener, preserving zero and gaps, and replaces changed inputs', async () => {
    const fixture = await render(ParticipantSpaghettiPlotComponent, {
      profiles: [
        { sessionId: 'p1', scores: [0, null, 80] },
        { sessionId: 'p2', scores: [10, 20, 30] },
      ],
    });
    const actual = chart(fixture);
    expect((actual.config as ChartConfiguration).type).toBe('line');
    expect(actual.data.datasets.length).toBe(2);
    expect(actual.data.datasets[0].data).toEqual([0, null, 80]);
    expect(fixture.componentInstance.data.datasets[0].spanGaps).toBeFalse();
    expect(actual.scales['y'].min).toBe(0);
    expect(actual.scales['y'].max).toBe(100);
    expect(fixture.nativeElement.querySelector('table').textContent).toContain('p1');
    fixture.componentRef.setInput('profiles', [{ sessionId: 'p3', scores: [50, 60, 70] }]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart(fixture).data.datasets.length).toBe(1);
    expect(chart(fixture).data.datasets[0].label).toBe('p3');
  });
  it('shows unavailable/empty notices rather than fabricated inferential canvases', async () => {
    const fixture = await render(EmmPlotComponent, { unavailable: 'Insufficient participants', means: [] });
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Insufficient participants');
    fixture.componentRef.setInput('unavailable', '');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Model means with confidence intervals are unavailable');
  });
  it('keeps 45 pair rows readable and shows every participant without sampling', async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({
      id: `c${index}`,
      name: `Long condition name ${index}`,
      module_index: index,
    }));
    const many = ten.flatMap((first, i) =>
      ten.slice(i + 1).map((second) => ({
        first: first.id,
        second: second.id,
        effect: 0,
        ci95: [-2, 2] as [number, number],
        p: 1,
        p_adjusted: 1,
      })),
    );
    const fixture = await render(TukeyForestPlotComponent, { conditions: ten, pairs: many });
    expect(fixture.componentInstance.points.length).toBe(45);
    expect(fixture.componentInstance.height).toBeGreaterThan(1500);
    expect(chart(fixture).getDatasetMeta(0).data.length).toBe(45);
    const lines = await render(ParticipantSpaghettiPlotComponent, {
      profiles: Array.from({ length: 100 }, (_, i) => ({ sessionId: `p${i}`, scores: [i, i, i] })),
    });
    expect(chart(lines).data.datasets.length).toBe(100);
  });
});
